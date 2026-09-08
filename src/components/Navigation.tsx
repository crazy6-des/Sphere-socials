import React from 'react';
import { Compass, DollarSign, Plus, Wallet as WalletIcon, User } from 'lucide-react';

export type TabType = 'feed' | 'earn' | 'create' | 'wallet' | 'profile';

interface NavigationProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  unreadNotifications?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  return (
    <nav
      id="sphere-bottom-nav"
      aria-label="Main Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-900/80 max-w-md mx-auto h-16 flex items-center justify-around px-2 text-xs select-none"
    >
      {/* Feed */}
      <button
        id="nav-tab-feed"
        onClick={() => onSelectTab('feed')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          currentTab === 'feed' ? 'text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Compass className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'feed' ? 2.5 : 1.75} />
        <span>Feed</span>
      </button>

      {/* Earn */}
      <button
        id="nav-tab-earn"
        onClick={() => onSelectTab('earn')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          currentTab === 'earn' ? 'text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <DollarSign className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'earn' ? 2.5 : 1.75} />
        <span>Earn</span>
      </button>

      {/* Prominent Central "+" Button */}
      <div className="flex-1 flex items-center justify-center">
        <button
          id="nav-tab-create"
          onClick={() => onSelectTab('create')}
          aria-label="Create Post"
          className="w-11 h-10 rounded-xl bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:bg-zinc-200"
        >
          <Plus className="w-6 h-6 text-black" strokeWidth={2.5} />
        </button>
      </div>

      {/* Wallet */}
      <button
        id="nav-tab-wallet"
        onClick={() => onSelectTab('wallet')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          currentTab === 'wallet' ? 'text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <WalletIcon className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'wallet' ? 2.5 : 1.75} />
        <span>Wallet</span>
      </button>

      {/* Profile */}
      <button
        id="nav-tab-profile"
        onClick={() => onSelectTab('profile')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
          currentTab === 'profile' ? 'text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <User className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'profile' ? 2.5 : 1.75} />
        <span>Me</span>
      </button>
    </nav>
  );
};
