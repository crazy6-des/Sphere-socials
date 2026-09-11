/**
 * Cloudflare Workers Entry Point for Sphere Social API.
 * Small compatibility layer keeps the existing Worker/API implementation authoritative
 * while bridging the production Web client to persisted D1/R2 social features.
 */
import { handleServerlessRequest } from './src/server/api';
import { sha256Hash, verifyJwt, generateId } from './src/server/auth/crypto';

export interface Env {
  DB: any;
  R2: any;
  JWT_SECRET: string;
  R2_PUBLIC_URL?: string;
  ADGEM_APP_ID?: string;
  ADGEM_API_KEY?: string;
  OFFERWALL_KEY?: string;
  ESRNB_APP_ID?: string;
  ESRNB_API_KEY?: string;
  MUSIC_API_KEY?: string;
  MUSIC_API_URL?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
}

function cors(request: Request): Record<string,string> { const origin=request.headers.get('Origin')||'*'; return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Requested-With','Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS'}; }
function json(data:any,status=200,request?:Request){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...cors(request||new Request('https://sphere.local'))}})}
async function authUserId(request:Request,env:Env):Promise<string|null>{
  const header=request.headers.get('Authorization')||''; if(!header.startsWith('Bearer '))return null;
  const token=header.slice(7).trim(); const payload=await verifyJwt<{userId:string}>(token,env.JWT_SECRET); if(!payload?.userId)return null;
  try{const hash=await sha256Hash(token);const session:any=await env.DB.prepare('SELECT user_id, revoked, expires_at FROM sessions WHERE token_hash = ?').bind(hash).first();if(session&&(session.revoked===1||Number(session.expires_at)<Date.now()))return null;return session?.user_id||payload.userId}catch{return payload.userId}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url=new URL(request.url); const path=url.pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors(request),'Access-Control-Max-Age':'86400'}});
    if(path.startsWith('/api/media/')&&request.method==='GET'){
      const key=path.slice('/api/media/'.length); return handleServerlessRequest(new Request(`${url.origin}/api/storage/${key}`,request),env);
    }
    if(path.match(/^\/api\/posts\/[a-zA-Z0-9_-]+\/save$/)&&request.method==='POST'){
      const userId=await authUserId(request,env); if(!userId)return json({success:false,error:'Authentication required to save posts.'},401,request);
      const postId=path.split('/')[3];
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS saved_posts (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,post_id TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,post_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE)`).run();
      const post=await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first(); if(!post)return json({success:false,error:'Post not found.'},404,request);
      const existing=await env.DB.prepare('SELECT id FROM saved_posts WHERE user_id = ? AND post_id = ?').bind(userId,postId).first(); let saved=false;
      if(existing)await env.DB.prepare('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?').bind(userId,postId).run(); else{await env.DB.prepare('INSERT INTO saved_posts (id,user_id,post_id,created_at) VALUES (?,?,?,?)').bind(`sav_${generateId(12)}`,userId,postId,Date.now()).run();saved=true;}
      return json({success:true,data:{saved}},200,request);
    }
    if(path==='/api/users/me/profile'&&request.method==='PUT'){
      const userId=await authUserId(request,env); if(!userId)return json({success:false,error:'Authentication required.'},401,request);
      const body:any=await request.json().catch(()=>({}));
      if(typeof body.username==='string'&&body.username.trim()){
        const username=body.username.trim().toLowerCase();
        if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))return json({success:false,error:'Username must be 3-20 alphanumeric characters or underscores.'},400,request);
        const taken=await env.DB.prepare('SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id<>?').bind(username,userId).first(); if(taken)return json({success:false,error:'That username is already taken.'},409,request);
        await env.DB.prepare('UPDATE users SET username=?,updated_at=? WHERE id=?').bind(username,Date.now(),userId).run();
      }
      const next={...body}; delete next.username;
      return handleServerlessRequest(new Request(request.url,{method:'PUT',headers:request.headers,body:JSON.stringify(next)}),env);
    }
    return handleServerlessRequest(request,env);
  },
};
