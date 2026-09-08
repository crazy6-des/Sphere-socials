/**
 * Cloudflare Workers Entry Point for Sphere Social API
 * Pure serverless execution backed by Cloudflare D1 and R2
 */
import { handleServerlessRequest } from './src/server/api';

export interface Env {
  DB: any; // Cloudflare D1 Binding
  R2: any; // Cloudflare R2 Binding
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleServerlessRequest(request, env);
  },
};
