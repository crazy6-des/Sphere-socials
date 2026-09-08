import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { handleServerlessRequest } from './src/server/api';

dotenv.config();

const PORT = 3000;
const app = express();

// Capture raw binary body for API routes so file uploads and JSON pass seamlessly to Web Request
app.use('/api', express.raw({ type: '*/*', limit: '10mb' }));

// Bridge incoming HTTP request to Serverless API handler
app.all('/api/*', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, val);
        }
      }
    }

    let bodyData: Buffer | undefined = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
      bodyData = req.body;
    }

    const webReq = new Request(url, {
      method: req.method,
      headers,
      body: bodyData,
      // @ts-ignore - Node.js fetch duplex requirement for streaming body
      duplex: 'half',
    });

    const webRes = await handleServerlessRequest(webReq, process.env);

    res.status(webRes.status);
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuf = await webRes.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    console.error('[API Bridge Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal Bridge Error' });
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sphere Social] Server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('[Startup Fatal Error]:', err);
  process.exit(1);
});
