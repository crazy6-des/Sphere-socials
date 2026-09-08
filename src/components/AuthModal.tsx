import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Loader2, AlertCircle, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/apiClient';

export type AuthModalMode = 'login' | 'signup' | 'forgot_password' | 'reset_password';

interface AuthModalProps {
  mode: AuthModalMode;
  onClose: () => void;
  onSuccess: () => void;
  onSwitchMode: (mode: AuthModalMode) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ mode, onClose, onSuccess, onSwitchMode }) => {
  const { login, register, resetPassword } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Password reset specific states
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [devToken, setDevToken] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detect token in URL if reset mode
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setResetToken(urlToken);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        if (!identifier.trim() || !password) {
          setError('Please enter your username/email and password.');
          setIsSubmitting(false);
          return;
        }
        await login(identifier.trim(), password);
        onSuccess();
      } else if (mode === 'signup') {
        if (!username.trim() || !email.trim() || !password) {
          setError('Please fill in all required fields.');
          setIsSubmitting(false);
          return;
        }
        await register({
          username: username.trim(),
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
        onSuccess();
      } else if (mode === 'forgot_password') {
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          setError('Please enter a valid email address.');
          setIsSubmitting(false);
          return;
        }
        const res = await apiClient.forgotPassword(email.trim());
        if (res.data?.emailSent) {
          setSuccessMessage(res.message || 'Password reset email has been dispatched to your inbox via Brevo. Please check your inbox.');
          setError(null);
        } else {
          setSuccessMessage(res.message);
          if (res.data?.emailError) {
            setError(res.data.emailError);
          }
        }
        if (res.data?.resetToken) {
          setDevToken(res.data.resetToken);
        }
      } else if (mode === 'reset_password') {
        if (!resetToken.trim()) {
          setError('Please provide the reset token.');
          setIsSubmitting(false);
          return;
        }
        if (!newPassword || newPassword.length < 6) {
          setError('Password must be at least 6 characters.');
          setIsSubmitting(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match.');
          setIsSubmitting(false);
          return;
        }
        const res = await resetPassword({
          token: resetToken.trim(),
          newPassword,
        });
        setSuccessMessage(res.message || 'Password reset successfully! You are now logged in.');
        if (res.user) {
          setTimeout(() => {
            onSuccess();
          }, 1200);
        } else {
          setTimeout(() => {
            onSwitchMode('login');
            setSuccessMessage(null);
          }, 2000);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Action failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="auth-modal-overlay"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="auth-modal-content"
        className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 relative shadow-2xl text-white animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          id="btn-close-auth-modal"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold tracking-tight mb-1">
          {mode === 'login' && 'Log in to Sphere'}
          {mode === 'signup' && 'Create your account'}
          {mode === 'forgot_password' && 'Reset your password'}
          {mode === 'reset_password' && 'Enter new password'}
        </h2>
        <p className="text-xs text-zinc-400 mb-5">
          {mode === 'login' && 'Access your feed, soundtrack tags, and wallet.'}
          {mode === 'signup' && 'Join the community and start earning attention rewards.'}
          {mode === 'forgot_password' && 'Enter your registered email to receive a password reset link.'}
          {mode === 'reset_password' && 'Choose a secure new password for your Sphere account.'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 flex items-start space-x-2 text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-start space-x-2 text-emerald-200 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Username *</label>
                <input
                  id="input-signup-username"
                  type="text"
                  required
                  placeholder="e.g. alex_photo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Display Name (Optional)</label>
                <input
                  id="input-signup-displayname"
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Email Address *</label>
                <input
                  id="input-signup-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Password *</label>
                <input
                  id="input-signup-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </>
          )}

          {mode === 'login' && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Username or Email *</label>
                <input
                  id="input-login-identifier"
                  type="text"
                  required
                  placeholder="Username or email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-400">Password *</label>
                  <button
                    id="btn-forgot-password-link"
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessMessage(null);
                      onSwitchMode('forgot_password');
                    }}
                    className="text-xs text-zinc-400 hover:text-white transition-colors underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="input-auth-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </>
          )}

          {mode === 'forgot_password' && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Registered Email *</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                <input
                  id="input-forgot-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              {devToken && (
                <div className="mt-3.5 p-3 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs space-y-2">
                  <div className="flex items-center space-x-1.5 text-zinc-200 font-semibold">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>Reset Token Ready</span>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Live email delivery is currently unconfigured. You can proceed directly to choose your new password.
                  </p>
                  <button
                    id="btn-proceed-reset-direct"
                    type="button"
                    onClick={() => {
                      setResetToken(devToken);
                      setError(null);
                      setSuccessMessage(null);
                      onSwitchMode('reset_password');
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <span>Choose New Password</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === 'reset_password' && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Reset Token *</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    id="input-reset-token"
                    type="text"
                    required
                    placeholder="Enter token from reset link"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">New Password *</label>
                <input
                  id="input-new-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Confirm New Password *</label>
                <input
                  id="input-confirm-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </>
          )}

          <button
            id="btn-auth-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 mt-2 rounded-xl bg-white text-black font-semibold text-sm flex items-center justify-center space-x-2 hover:bg-zinc-200 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : (
              <>
                <span>
                  {mode === 'login' && 'Log in'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'forgot_password' && 'Send Reset Link'}
                  {mode === 'reset_password' && 'Reset Password'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-zinc-400 space-y-2">
          {mode === 'login' && (
            <div>
              Don't have an account?{' '}
              <button
                id="btn-switch-to-signup"
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  onSwitchMode('signup');
                }}
                className="text-white font-medium hover:underline"
              >
                Sign up
              </button>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              Already have an account?{' '}
              <button
                id="btn-switch-to-login"
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  onSwitchMode('login');
                }}
                className="text-white font-medium hover:underline"
              >
                Log in
              </button>
            </div>
          )}

          {(mode === 'forgot_password' || mode === 'reset_password') && (
            <div>
              <button
                id="btn-back-to-login"
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  onSwitchMode('login');
                }}
                className="text-white font-medium hover:underline"
              >
                Back to Log in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
