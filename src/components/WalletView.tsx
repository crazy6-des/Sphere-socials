import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, ArrowDownRight, ArrowUpRight, Clock, CheckCircle2, AlertCircle, Loader2, DollarSign } from 'lucide-react';
import { Wallet, Transaction } from '../types';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';

export const WalletView: React.FC = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Withdrawal modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [payoutMethod, setPayoutMethod] = useState<'paypal' | 'crypto_usdt' | 'bank'>('paypal');
  const [destinationAccount, setDestinationAccount] = useState<string>('');
  const [withdrawing, setWithdrawing] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  const fetchWallet = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getWallet();
      setWallet(res.wallet);
      setTransactions(res.transactions);
    } catch (err) {
      console.error('[Wallet] Error fetching wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawSuccess(null);

    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setWithdrawError('Enter a valid withdrawal amount.');
      return;
    }
    if (amountNum < 5.0) {
      setWithdrawError('Minimum withdrawal is $5.00.');
      return;
    }
    if (!wallet || amountNum > wallet.balance) {
      setWithdrawError('Insufficient balance for this withdrawal.');
      return;
    }
    if (!destinationAccount.trim()) {
      setWithdrawError('Please enter your payout destination account or address.');
      return;
    }

    setWithdrawing(true);
    try {
      const res = await apiClient.requestWithdrawal({
        amount: amountNum,
        payoutMethod,
        destinationAccount: destinationAccount.trim(),
      });
      setWithdrawSuccess(`Withdrawal of $${amountNum.toFixed(2)} requested successfully (Ref: ${res.withdrawalId}).`);
      setWithdrawAmount('');
      setDestinationAccount('');
      await fetchWallet();
      setTimeout(() => {
        setShowWithdrawModal(false);
        setWithdrawSuccess(null);
      }, 2500);
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal request failed.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading && !wallet) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-black text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin text-white mr-2" />
        <span className="text-xs font-mono">LOADING WALLET LEDGER</span>
      </div>
    );
  }

  return (
    <div
      id="sphere-wallet-view"
      className="min-h-[calc(100dvh-4rem)] bg-black text-white px-4 py-6 max-w-md mx-auto pb-20 overflow-y-auto select-none"
    >
      {/* Balance Summary Display */}
      <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-6 mb-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2 text-zinc-400">
          <span className="text-xs font-medium tracking-wide uppercase">Authoritative Balance</span>
          <WalletIcon className="w-4 h-4 text-zinc-500" />
        </div>

        <div className="flex items-baseline space-x-1 mb-6">
          <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
            ${(wallet?.balance || 0).toFixed(2)}
          </span>
          <span className="text-xs font-mono text-zinc-500">USD</span>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-900 text-xs">
          <div>
            <p className="text-zinc-500 text-[11px] mb-0.5">Total Earned</p>
            <p className="font-semibold text-zinc-200 font-mono">
              +${(wallet?.totalEarned || 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-zinc-500 text-[11px] mb-0.5">Total Withdrawn</p>
            <p className="font-semibold text-zinc-200 font-mono">
              ${(wallet?.totalWithdrawn || 0).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Withdraw Action */}
        <div className="mt-5">
          <button
            id="btn-open-withdraw-modal"
            onClick={() => setShowWithdrawModal(true)}
            disabled={(wallet?.balance || 0) < 5}
            className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-white active:scale-95 transition-all flex items-center justify-center space-x-2"
          >
            <ArrowDownRight className="w-4 h-4" />
            <span>{(wallet?.balance || 0) < 5 ? 'Minimum $5 to Withdraw' : 'Request Payout'}</span>
          </button>
        </div>
      </div>

      {/* Transactions Section */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Transaction History ({transactions.length})
        </h3>
        <button
          onClick={fetchWallet}
          className="text-[11px] text-zinc-500 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="p-8 rounded-2xl bg-zinc-950 border border-zinc-900 text-center text-zinc-500 text-xs">
          <Clock className="w-6 h-6 mx-auto mb-2 text-zinc-700" />
          <p>No transactions recorded yet.</p>
          <p className="text-[11px] text-zinc-600 mt-1">
            Earn attention yield or complete offers to see credited transactions.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-900 flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tx.amount > 0 ? 'bg-emerald-950/50 text-emerald-400' : 'bg-zinc-900 text-zinc-400'
                  }`}
                >
                  {tx.amount > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate text-xs">{tx.description}</p>
                  <p className="text-[10px] text-zinc-500">
                    {new Date(tx.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 ml-2">
                <p
                  className={`font-mono font-bold ${
                    tx.amount > 0 ? 'text-emerald-400' : 'text-zinc-200'
                  }`}
                >
                  {tx.amount > 0 ? `+$${tx.amount.toFixed(2)}` : `-$${Math.abs(tx.amount).toFixed(2)}`}
                </p>
                <span
                  className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium ${
                    tx.status === 'completed'
                      ? 'bg-emerald-950 text-emerald-400'
                      : tx.status === 'pending'
                      ? 'bg-amber-950 text-amber-400'
                      : 'bg-zinc-900 text-zinc-400'
                  }`}
                >
                  {tx.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Withdrawal Modal */}
      {showWithdrawModal && (
        <div
          id="withdraw-modal-overlay"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            id="withdraw-modal-content"
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-white"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold tracking-tight">Request Payout</h3>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {withdrawError && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 flex items-start space-x-2 text-red-200 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span>{withdrawError}</span>
              </div>
            )}

            {withdrawSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-start space-x-2 text-emerald-200 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>{withdrawSuccess}</span>
              </div>
            )}

            <form onSubmit={handleWithdrawalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Amount (USD) — Balance: ${(wallet?.balance || 0).toFixed(2)}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 text-xs">$</span>
                  <input
                    id="input-withdraw-amount"
                    type="number"
                    step="0.01"
                    min="5"
                    max={wallet?.balance || 0}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="5.00"
                    required
                    className="w-full pl-7 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Payout Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['paypal', 'crypto_usdt', 'bank'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPayoutMethod(method)}
                      className={`py-2 px-1 rounded-lg border text-[11px] font-medium transition-colors uppercase tracking-wider ${
                        payoutMethod === method
                          ? 'border-white bg-zinc-900 text-white font-bold'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {method.replace('crypto_', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  {payoutMethod === 'paypal'
                    ? 'PayPal Email'
                    : payoutMethod === 'crypto_usdt'
                    ? 'USDT Wallet Address (TRC20/ERC20)'
                    : 'Bank Account / IBAN'}
                </label>
                <input
                  id="input-withdraw-account"
                  type="text"
                  required
                  value={destinationAccount}
                  onChange={(e) => setDestinationAccount(e.target.value)}
                  placeholder={
                    payoutMethod === 'paypal'
                      ? 'payout@example.com'
                      : payoutMethod === 'crypto_usdt'
                      ? 'T...'
                      : 'Account Number / IBAN'
                  }
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-zinc-500"
                />
              </div>

              <button
                id="btn-submit-withdrawal"
                type="submit"
                disabled={withdrawing}
                className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 disabled:opacity-40 flex items-center justify-center space-x-2 active:scale-95 transition-all"
              >
                {withdrawing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Submit Payout Request</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
