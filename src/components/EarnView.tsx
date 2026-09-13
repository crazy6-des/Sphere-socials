import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert, CheckCircle2, Clock, Sparkles, ExternalLink, Loader2, AlertCircle, Copy, Check, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { RewardProviderStatus } from '../types';
import { apiClient } from '../services/apiClient';

const CPAGRIP_SMART_LINK = 'https://quartzfiles.com/1912924';
const CPAGRIP_OFFERWALL_SCRIPT = 'https://quartzfiles.com/script_include.php?id=1913036';
const PUBLIC_API_ORIGIN = String((import.meta as any).env?.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

export const EarnView: React.FC = () => {
  const [providers, setProviders] = useState<RewardProviderStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [claiming, setClaiming] = useState<boolean>(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [openingCpagrip, setOpeningCpagrip] = useState<boolean>(false);
  const offerwallRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await apiClient.getEarnProviders();
        setProviders(res.providers);
      } catch (err) {
        console.error('[Earn] Failed to fetch reward providers:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProviders();
  }, []);

  useEffect(() => {
    const cpagrip = providers.find((provider) => provider.id === 'cpagrip');
    const user = apiClient.getCachedUser() as any;
    const userId = String(user?.id || '').trim();
    const container = offerwallRef.current;
    if (!container || !userId || !cpagrip?.isConfigured) return;

    container.replaceChildren();
    const script = document.createElement('script');
    const url = new URL(CPAGRIP_OFFERWALL_SCRIPT);
    url.searchParams.set('tracking_id', userId);
    script.src = url.toString();
    script.async = true;
    script.type = 'text/javascript';
    script.dataset.sphereOfferwall = 'cpagrip';
    container.appendChild(script);

    return () => {
      script.remove();
      container.replaceChildren();
    };
  }, [providers]);

  const handleClaimAttention = async () => {
    setClaiming(true);
    setClaimMessage(null);
    setClaimError(null);
    try {
      const res = await apiClient.claimAttentionReward();
      setClaimMessage(res.message);
    } catch (err: any) {
      setClaimError(err.message || 'Failed to verify attention session.');
    } finally {
      setClaiming(false);
    }
  };

  const handleCopyPostback = (providerId: string) => {
    const origin = PUBLIC_API_ORIGIN || window.location.origin;
    const postbackUrl = providerId === 'cpalead'
      ? `${origin}/api/cpal_postback?subid={subid}&lead_id={lead_id}&campaign_id={campaign_id}&campaign_name={campaign_name}&payout={payout}&password={password}`
      : providerId === 'cpagrip'
        ? `${origin}/api/earn/postback/cpagrip`
        : `${origin}/api/earn/postback/${providerId}`;
    navigator.clipboard.writeText(postbackUrl).then(() => {
      setCopiedId(providerId);
      window.setTimeout(() => setCopiedId(null), 2500);
    }).catch(() => setClaimError('Clipboard access was blocked. Select and copy the URL manually.'));
  };

  const handleTestReward = async (providerId: string) => {
    setTestingId(providerId);
    setClaimMessage(null);
    setClaimError(null);
    try {
      const res = await apiClient.simulateEarnReward(providerId, 0.25);
      setClaimMessage(`[${providerId.toUpperCase()}] ${res.message}`);
    } catch (err: any) {
      setClaimError(err.message || 'Failed to trigger test reward credit.');
    } finally {
      setTestingId(null);
    }
  };

  const handleStartCpagrip = () => {
    const user = apiClient.getCachedUser() as any;
    const userId = String(user?.id || '').trim();
    if (!userId) {
      setClaimError('Please sign in again before starting an offer.');
      return;
    }
    const url = new URL(CPAGRIP_SMART_LINK);
    url.searchParams.set('tracking_id', userId);
    setOpeningCpagrip(true);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
    window.setTimeout(() => setOpeningCpagrip(false), 800);
  };

  const cpagrip = providers.find((provider) => provider.id === 'cpagrip');

  return (
    <div id="sphere-earn-view" className="min-h-[calc(100dvh-4rem)] bg-black text-white px-4 py-6 max-w-md mx-auto pb-20 overflow-y-auto select-none">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-white mb-1">Monetize Attention</h2>
        <p className="text-xs text-zinc-400">Earn real yields through verified attention engagement and integrated provider offerwalls.</p>
      </div>

      <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-5 mb-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2"><Sparkles className="w-4 h-4 text-zinc-300" /><span className="text-xs font-semibold tracking-wide uppercase text-zinc-300">Active Attention Yield</span></div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">Authoritative</span>
        </div>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">Sphere rewards users for genuine attention. Verify your daily content engagement session to receive direct wallet yield.</p>
        {claimMessage && <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-start space-x-2 text-emerald-200 text-xs"><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" /><span>{claimMessage}</span></div>}
        {claimError && <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-start space-x-2 text-amber-200 text-xs"><AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" /><span>{claimError}</span></div>}
        <button id="btn-claim-attention" onClick={handleClaimAttention} disabled={claiming} className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center space-x-2">
          {claiming ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <span>Verify Attention Session (+$0.15)</span>}
        </button>
      </div>

      {cpagrip && (
        <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div><h3 className="text-sm font-bold text-white">CPAGrip Offers</h3><p className="text-[11px] text-zinc-400 mt-1">Offerwall and Smartlink use your Sphere ID as CPAGrip tracking_id.</p></div>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${cpagrip.isConfigured ? 'text-emerald-400 border-emerald-800 bg-emerald-950' : 'text-zinc-500 border-zinc-800 bg-zinc-900'}`}>{cpagrip.isConfigured ? 'READY' : 'PENDING'}</span>
          </div>

          <div ref={offerwallRef} id="sphere-cpagrip-offerwall" className="mt-3 min-h-24 rounded-xl bg-black border border-zinc-900 overflow-hidden" aria-label="CPAGrip Offerwall">
            {!cpagrip.isConfigured && <div className="p-4 text-center text-[11px] text-zinc-500">Offerwall activates after the CPAGrip server-side callback secret is configured.</div>}
          </div>

          <button type="button" onClick={handleStartCpagrip} disabled={openingCpagrip} className="w-full mt-3 py-2.5 rounded-xl bg-white text-black font-semibold text-xs disabled:opacity-50 flex items-center justify-center space-x-2">
            {openingCpagrip ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}<span>Open CPAGrip Smartlink</span>
          </button>
          <p className="text-[10px] text-zinc-500 mt-2 text-center">Only verified provider conversions reach your wallet.</p>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Reward Provider Abstraction</h3><span className="text-[10px] text-zinc-500 font-mono">Serverless Boundary</span></div>
      <p className="text-xs text-zinc-500 mb-4">Sphere connects to enterprise offerwalls via replaceable provider adapters. Missing credentials do not generate fake rewards.</p>

      {loading ? (
        <div className="h-36 flex items-center justify-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2 text-zinc-400" /><span className="text-xs font-mono">Querying Provider Architecture...</span></div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div key={provider.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-xs">
              <div className="flex items-center justify-between mb-1.5"><span className="font-bold text-white text-sm">{provider.name}</span><span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono ${provider.isConfigured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}>{provider.isConfigured ? <><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span>CONNECTED</span></> : <><Clock className="w-3 h-3 text-zinc-500" /><span>PENDING CREDENTIALS</span></>}</span></div>
              <p className="text-[11px] text-zinc-400 mb-2.5 leading-relaxed">{provider.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-2.5">{provider.supportedOfferTypes.map((type) => <span key={type} className="px-2 py-0.5 rounded bg-zinc-900/90 text-zinc-400 text-[10px] border border-zinc-800/80">{type}</span>)}</div>
              <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-[11px] text-zinc-400 font-mono mb-3">{provider.configurationNotes}</div>
              <div className="border-t border-zinc-900 pt-2.5">
                <button type="button" onClick={() => setExpandedId(expandedId === provider.id ? null : provider.id)} className="w-full flex items-center justify-between text-[11px] text-zinc-400 hover:text-white py-1 transition-colors"><span className="font-semibold">Publisher Postback & Sandbox Tools</span>{expandedId === provider.id ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}</button>
                {expandedId === provider.id && (
                  <div className="mt-2.5 p-3 rounded-lg bg-black border border-zinc-800 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1"><span className="text-[10px] uppercase font-semibold text-zinc-400">Server Postback URL</span><button type="button" onClick={() => handleCopyPostback(provider.id)} className="text-[10px] text-zinc-400 hover:text-white flex items-center space-x-1">{copiedId === provider.id ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></> : <><Copy className="w-3 h-3" /><span>Copy URL</span></>}</button></div>
                      <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300 break-all select-all">{provider.id === 'cpalead' ? `${PUBLIC_API_ORIGIN || window.location.origin}/api/cpal_postback?subid={subid}&lead_id={lead_id}&campaign_id={campaign_id}&campaign_name={campaign_name}&payout={payout}&password={password}` : provider.id === 'cpagrip' ? `${PUBLIC_API_ORIGIN || window.location.origin}/api/earn/postback/cpagrip` : `${PUBLIC_API_ORIGIN || window.location.origin}/api/earn/postback/${provider.id}`}</div>
                      <p className="text-[10px] text-zinc-500 mt-1">Provider callbacks terminate at the Cloudflare Worker. Secrets remain server-side.</p>
                    </div>
                    <div className="flex items-center justify-between pt-1"><span className="text-[10px] text-zinc-400">Verify persistent wallet pipeline:</span><button type="button" onClick={() => handleTestReward(provider.id)} disabled={testingId === provider.id} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-40">{testingId === provider.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-emerald-400" />}<span>Test Reward Credit (+$0.25)</span></button></div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
