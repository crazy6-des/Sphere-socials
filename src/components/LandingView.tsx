import React, { useState, useEffect } from 'react';
import { Compass, Sparkles, Shield, Smartphone, ArrowRight, Music, Image as ImageIcon } from 'lucide-react';
import { AuthModal, AuthModalMode } from './AuthModal';

interface LandingViewProps {
  onSuccessAuth: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onSuccessAuth }) => {
  const [authMode, setAuthMode] = useState<AuthModalMode | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('token')) {
        setAuthMode('reset_password');
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-zinc-800 pb-16 overflow-y-auto max-w-md mx-auto relative border-x border-zinc-900">
      {/* Top Brand Bar */}
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-zinc-900">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center bg-zinc-950 font-bold text-sm tracking-wider">
            S
          </div>
          <span className="font-semibold tracking-tight text-lg">Sphere</span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            id="btn-landing-login-top"
            onClick={() => setAuthMode('login')}
            className="text-xs font-medium text-zinc-300 hover:text-white px-3 py-1.5 transition-colors"
          >
            Log in
          </button>
          <button
            id="btn-landing-signup-top"
            onClick={() => setAuthMode('signup')}
            className="text-xs font-semibold bg-white text-black px-3.5 py-1.5 rounded-full hover:bg-zinc-200 transition-colors"
          >
            Sign up
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-12 text-center flex flex-col items-center">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs mb-6">
          <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
          <span>Next-generation social economy</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4 leading-tight">
          Welcome to <br />
          <span className="text-zinc-100">Sphere Social</span>
        </h1>

        <p className="text-2xl font-light text-zinc-300 mb-6 tracking-tight">
          Monetize your attention.
        </p>

        <p className="text-zinc-400 text-sm max-w-xs leading-relaxed mb-8">
          A lightweight, content-first short-form platform. Share high-res images, tag original soundtracks, connect with creators, and receive direct micropayments for your active attention.
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            id="btn-hero-get-started"
            onClick={() => setAuthMode('signup')}
            className="w-full py-3.5 rounded-xl bg-white text-black font-semibold text-sm flex items-center justify-center space-x-2 hover:bg-zinc-200 active:scale-[0.99] transition-all"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            id="btn-hero-login"
            onClick={() => setAuthMode('login')}
            className="w-full py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 font-medium text-sm hover:bg-zinc-800 transition-colors"
          >
            Have an account? Log in
          </button>
        </div>
      </section>

      {/* Core Principles Section */}
      <section className="px-6 py-10 border-t border-zinc-900">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-6">
          What is Sphere
        </h2>

        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0 border border-zinc-800">
              <ImageIcon className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Content-First Experience</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Full-screen vertical feed focused entirely on creator photography and artistic imagery, free from unnecessary sidebars and card clutter.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0 border border-zinc-800">
              <Music className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Soundtrack Tagging</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Search and attach legal soundtrack metadata and audio previews to your visual posts with a single tap.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0 border border-zinc-800">
              <Shield className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Serverless & Persistent</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Engineered for Cloudflare edge infrastructure. All creator media, social interactions, and wallet balances persist with zero data loss.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PWA Home-Screen Instruction (Mandated in Prompt) */}
      <section className="px-6 py-8 mx-4 my-6 rounded-2xl bg-zinc-950 border border-zinc-800">
        <div className="flex items-center space-x-2 text-zinc-300 mb-3">
          <Smartphone className="w-4 h-4 text-white" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">PWA / Web App</span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed font-mono bg-zinc-900/90 p-3.5 rounded-xl border border-zinc-800">
          «Click the "..." menu in your browser and choose the option to add this site to your home screen.»
        </p>
        <p className="text-[11px] text-zinc-500 mt-2">
          Sphere is a lightweight progressive web application that runs directly in your browser without requiring an app store download.
        </p>
      </section>

      {/* Footer */}
      <footer className="px-6 pt-4 text-center text-xs text-zinc-600">
        <p>Sphere Social • Architecture-First Build</p>
      </footer>

      {/* Auth Modal */}
      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={() => {
            setAuthMode(null);
            onSuccessAuth();
          }}
          onSwitchMode={(newMode) => setAuthMode(newMode)}
        />
      )}
    </div>
  );
};
