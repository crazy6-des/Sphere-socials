import { apiClient } from './services/apiClient';

export interface SphereMessage {
  id: string;
  conversation_id?: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: number;
  read_at?: number | null;
}

export interface SphereConversation {
  id: string;
  participant_id?: string;
  participant?: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  last_message?: SphereMessage | null;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = apiClient.getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const base = (import.meta as any).env?.VITE_API_BASE_URL || '';
  const response = await fetch(`${base}${endpoint}`, { ...options, headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Messaging request failed (${response.status})`);
  }
  return (json.data !== undefined ? json.data : json) as T;
}

export const api = {
  getConversations: () => request<{ conversations: SphereConversation[] }>('/messages'),
  getMessages: (conversationId: string) =>
    request<{ messages: SphereMessage[] }>(`/messages?conversation_id=${encodeURIComponent(conversationId)}`),
  sendMessage: (recipientUserId: string, content: string, conversationId?: string) =>
    request<any>('/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipient_id: recipientUserId,
        content,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      }),
    }),
  markMessagesRead: (conversationId: string) =>
    request<any>(`/messages/${encodeURIComponent(conversationId)}/read`, { method: 'POST' }),
};
