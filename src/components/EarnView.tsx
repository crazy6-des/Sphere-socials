import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { RewardProviderStatus } from '../types';
import { apiClient } from '../services/apiClient';

const CPAGRIP_SMART_LINK = 'https://quartzfiles.com/1912924';
const MIN_WITHDRAWAL = 5;

export const EarnView: React.FC = () => {
  const [providers, setProviders] = useState<RewardProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    apiClient.getEarnProviders().then(r => setProviders(r.providers)).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const claim = async () => {
    setClaiming(true); setMessage(null); setError(null);
    try { const r = await apiClient.claimAttentionReward(); setMessage(r.message); }
    catch (e: any) { setError(e.message || 'Unable to claim daily reward.'); }
    finally { setClaiming(false); }
  };

  const openCpagrip = () => {
    const user = apiClient.getCachedUser() as any;
    const id = String(user?.id || '').trim();
    if (!id) { setError('Please sign in again before starting an offer.'); return; }
    const url = new URL(CPAGRIP_SMART_LINK);
    url.searchParams.set('tracking_id', id);
    setOpening(true);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
    setTimeout(() => setOpening(false), 800);
  };

  const cpagrip = providers.find(p => p.id === 'cpagrip');

  return <div id="sphere-earn-view" className="min-h-[calc(100dvh-4rem)] bg-black text-white px-4 py-6 max-w-md mx-auto pb-20 overflow-y-auto select-none">
    <div className="mb-6"><h2 className="text-xl font-bold">Earn Rewards</h2><p className="text-xs text-zinc-400 mt-1">Complete genuine offers and surveys. Approved rewards are credited to your Sphere wallet.</p></div>

    <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-5 mb-5">
      <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4" /><span className="text-xs font-semibold uppercase">Daily Sphere Reward</span></div>
      <p className="text-xs text-zinc-400 mb-4">Verify one genuine daily attention session for a fixed $0.15 reward.</p>
      {message && <div className="mb-3 p-3 rounded-xl bg-emerald-950/40 text-emerald-200 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}
      {error && <div className="mb-3 p-3 rounded-xl bg-amber-950/40 text-amber-200 text-xs flex gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
      <button onClick={claim} disabled={claiming} className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-semibold disabled:opacity-40 flex justify-center gap-2">{claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Attention Session (+$0.15)'}</button>
    </div>

    <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-5 mb-5">
      <div className="flex justify-between"><span className="text-xs font-semibold uppercase text-zinc-300">Simple withdrawal cycle</span><span className="text-[10px] text-zinc-500">Month-end</span></div>
      <p className="text-xs text-zinc-400 mt-2">Rewards accumulate in your wallet. Withdrawals use a simple month-end cycle instead of exposing provider settlement complexity.</p>
      <div className="mt-3 rounded-lg border border-zinc-800 bg-black p-3 text-xs"><span className="text-zinc-500">Minimum withdrawal</span><strong className="block text-white mt-1">${MIN_WITHDRAWAL.toFixed(2)}</strong></div>
    </div>

    {cpagrip && <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-5 mb-5">
      <div className="flex justify-between gap-3"><div><h3 className="text-sm font-bold">CPAGrip Offers</h3><p className="text-[11px] text-zinc-400 mt-1">Your Sphere user ID is attached automatically as CPAGrip tracking_id.</p></div><span className={`text-[10px] px-2 py-0.5 rounded border ${cpagrip.isConfigured ? 'text-emerald-400 border-emerald-800 bg-emerald-950' : 'text-zinc-500 border-zinc-800 bg-zinc-900'}`}>{cpagrip.isConfigured ? 'READY' : 'PENDING'}</span></div>
      <button onClick={openCpagrip} disabled={opening} className="w-full mt-3 py-2.5 rounded-xl bg-white text-black text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50">{opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}Start CPAGrip Offers</button>
      <p className="text-[10px] text-zinc-500 mt-2 text-center">Only verified provider conversions are credited.</p>
    </div>}

    <div className="mb-3 flex justify-between"><h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Reward Providers</h3><span className="text-[10px] text-zinc-500">Server verified</span></div>
    {loading ? <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div> : <div className="space-y-3">{providers.map(p => <div key={p.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-900"><div className="flex justify-between"><span className="font-bold text-sm">{p.name}</span><span className="text-[10px] flex items-center gap-1">{p.isConfigured ? <><CheckCircle2 className="w-3 h-3 text-emerald-400" />READY</> : <><Clock className="w-3 h-3 text-zinc-500" />PENDING</>}</span></div><p className="text-[11px] text-zinc-400 mt-2">{p.description}</p><div className="flex flex-wrap gap-1 mt-2">{p.supportedOfferTypes.map(t => <span key={t} className="px-2 py-0.5 rounded bg-zinc-900 text-[10px] text-zinc-400">{t}</span>)}</div></div>)}</div>}
  </div>;
};
