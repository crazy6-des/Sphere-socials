import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MessageCircle, Send } from 'lucide-react';
import { UserPublicProfile } from '../types';
import { api, SphereConversation, SphereMessage } from '../api';
import { useAuth } from '../context/AuthContext';

interface MessagesViewProps { selectedUser?: UserPublicProfile | null; onCloseSelected?: () => void; }
const str = (v: unknown) => typeof v === 'string' ? v : '';
const normalizeMessage = (raw: any): SphereMessage | null => {
  const id = str(raw?.id || raw?.message_id), sender = str(raw?.sender_id || raw?.senderId), recipient = str(raw?.recipient_id || raw?.recipientId), content = str(raw?.content || raw?.body || raw?.text);
  if (!id || !sender || !recipient || !content) return null;
  return { id, conversation_id: str(raw?.conversation_id || raw?.conversationId) || undefined, sender_id: sender, recipient_id: recipient, content, created_at: Number(raw?.created_at || raw?.createdAt || Date.now()), read_at: raw?.read_at ?? raw?.readAt ?? null };
};
const normalizeConversation = (raw: any): SphereConversation | null => {
  const id = str(raw?.id || raw?.conversation_id || raw?.conversationId);
  if (!id) return null;
  const p = raw?.participant || raw?.recipient || raw?.user || raw?.other_user;
  const pid = str(raw?.participant_id || raw?.participantId || p?.id);
  return { id, participant_id: pid || undefined, participant: pid ? { id: pid, username: str(p?.username), displayName: str(p?.display_name || p?.displayName), avatarUrl: str(p?.avatar_url || p?.avatarUrl) } : undefined, last_message: normalizeMessage(raw?.last_message || raw?.lastMessage) };
};

export const MessagesView: React.FC<MessagesViewProps> = ({ selectedUser, onCloseSelected }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<SphereConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<UserPublicProfile | null>(selectedUser || null);
  const [messages, setMessages] = useState<SphereMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recipientId = activeRecipient?.id || '';

  const loadConversations = useCallback(async () => {
    const result = await api.getConversations();
    const items = (result.conversations || []).map(normalizeConversation).filter(Boolean) as SphereConversation[];
    setConversations(items);
    return items;
  }, []);

  const loadMessages = useCallback(async (id: string, showLoader = true) => {
    if (showLoader) setLoadingMessages(true);
    try {
      const result = await api.getMessages(id);
      setMessages((result.messages || []).map(normalizeMessage).filter(Boolean) as SphereMessage[]);
      await api.markMessagesRead(id).catch(() => {});
    } finally { if (showLoader) setLoadingMessages(false); }
  }, []);

  const openConversation = useCallback(async (conversation: SphereConversation, profile?: UserPublicProfile | null) => {
    setError(null); setActiveConversationId(conversation.id); if (profile) setActiveRecipient(profile); setMessages([]); await loadMessages(conversation.id);
  }, [loadMessages]);

  useEffect(() => { setActiveRecipient(selectedUser || null); }, [selectedUser]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    loadConversations().then(items => {
      if (cancelled) return;
      if (selectedUser) {
        const match = items.find(c => c.participant_id === selectedUser.id || c.participant?.id === selectedUser.id);
        if (match) void openConversation(match, selectedUser); else { setActiveConversationId(null); setMessages([]); }
      } else if (items[0]) { setActiveConversationId(items[0].id); void loadMessages(items[0].id); }
    }).catch((e: any) => { if (!cancelled) setError(e.message || 'Unable to load messages.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadConversations, loadMessages, openConversation, selectedUser]);

  useEffect(() => {
    if (!activeConversationId) return;
    const timer = window.setInterval(() => { void loadMessages(activeConversationId, false).catch(() => {}); }, 4000);
    return () => window.clearInterval(timer);
  }, [activeConversationId, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const title = useMemo(() => {
    if (activeRecipient) return activeRecipient.displayName || `@${activeRecipient.username}`;
    const c = conversations.find(item => item.id === activeConversationId);
    return c?.participant?.displayName || (c?.participant?.username ? `@${c.participant.username}` : 'Messages');
  }, [activeRecipient, conversations, activeConversationId]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !recipientId || sending) return;
    setSending(true); setError(null);
    try {
      const result = await api.sendMessage(recipientId, content, activeConversationId || undefined);
      const sent = normalizeMessage(result?.message || result?.data?.message || result);
      if (sent) {
        setMessages(current => current.some(m => m.id === sent.id) ? current : [...current, sent]);
        if (!activeConversationId && sent.conversation_id) setActiveConversationId(sent.conversation_id);
      } else if (activeConversationId) await loadMessages(activeConversationId, false);
      else {
        const items = await loadConversations();
        const match = items.find(c => c.participant_id === recipientId || c.participant?.id === recipientId);
        if (match) { setActiveConversationId(match.id); await loadMessages(match.id, false); }
      }
      setDraft('');
    } catch (e: any) { setError(e.message || 'Message could not be sent.'); }
    finally { setSending(false); }
  };

  if (!user) return null;
  return <div className="h-[calc(100dvh-4rem)] bg-black text-white flex flex-col max-w-md mx-auto">
    <header className="h-14 shrink-0 border-b border-zinc-900 flex items-center px-4">
      {activeConversationId && onCloseSelected && <button onClick={() => { setActiveConversationId(null); setActiveRecipient(null); onCloseSelected(); }} className="mr-3 p-1 text-zinc-400 hover:text-white" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>}
      <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden mr-2.5 flex items-center justify-center">{activeRecipient?.avatarUrl ? <img src={activeRecipient.avatarUrl} alt="" className="w-full h-full object-cover" /> : <MessageCircle className="w-4 h-4 text-zinc-500" />}</div>
      <div className="min-w-0"><h1 className="text-sm font-semibold truncate">{title}</h1>{activeRecipient?.username && <p className="text-[10px] text-zinc-500 truncate">@{activeRecipient.username}</p>}</div>
    </header>
    {error && <div className="mx-4 mt-3 p-2.5 rounded-lg border border-red-900/70 bg-red-950/40 text-xs text-red-300">{error}</div>}
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2">
      {!activeConversationId && !activeRecipient && !loading && conversations.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500"><MessageCircle className="w-8 h-8 mb-3 text-zinc-700" /><p className="text-sm text-zinc-300">No conversations yet</p><p className="text-xs mt-1">Open a user profile and tap Message to start a conversation.</p></div>}
      {loadingMessages && messages.length === 0 && <div className="flex items-center justify-center py-8 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin" /></div>}
      {!loadingMessages && activeConversationId && messages.length === 0 && <div className="h-full flex items-center justify-center text-xs text-zinc-600">No messages yet. Say hello.</div>}
      {messages.map(message => { const sent = message.sender_id === user.id; return <div key={message.id} className={`flex ${sent ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${sent ? 'bg-white text-black rounded-br-md' : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-md'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><time className={`block text-[9px] mt-1 ${sent ? 'text-zinc-500' : 'text-zinc-600'}`}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div></div>; })}
      <div ref={bottomRef} />
    </div>
    {activeRecipient && recipientId && <form onSubmit={send} className="shrink-0 border-t border-zinc-900 bg-black p-3 flex gap-2"><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message @${activeRecipient.username}`} maxLength={2000} className="flex-1 min-w-0 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-zinc-600" /><button type="submit" disabled={!draft.trim() || sending} aria-label="Send message" className="w-11 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-40">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button></form>}
  </div>;
};
