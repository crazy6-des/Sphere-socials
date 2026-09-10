import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navigation, TabType } from './components/Navigation';
import { LandingView } from './components/LandingView';
import { FeedView } from './components/FeedView';
import { EarnView } from './components/EarnView';
import { WalletView } from './components/WalletView';
import { ProfileView } from './components/ProfileView';
import { MessagesView } from './components/MessagesView';
import { PostCreationModal } from './components/PostCreationModal';
import { apiClient } from './services/apiClient';
import { UserPublicProfile } from './types';
import { Loader2, MessageCircle } from 'lucide-react';

function SphereMain() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('feed');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inspectedCreator, setInspectedCreator] = useState<string | null>(null);
  const [messageRecipient, setMessageRecipient] = useState<UserPublicProfile | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      apiClient.getUserSettings().then((res) => {
        if (res?.settings) {
          const root = document.documentElement;
          if (res.settings.theme === 'light') { root.classList.remove('dark'); root.classList.add('light'); }
          else { root.classList.remove('light'); root.classList.add('dark'); }
          if (res.settings.accentColor) root.setAttribute('data-accent', res.settings.accentColor);
        }
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  if (isLoading) return <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center"><div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center font-bold text-sm mb-4">S</div><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  if (!isAuthenticated) return <LandingView onSuccessAuth={() => setCurrentTab('feed')} />;

  const handleSelectTab = (tab: TabType) => {
    if (tab === 'create') { setShowCreateModal(true); return; }
    setInspectedCreator(null);
    setMessageRecipient(null);
    setCurrentTab(tab);
  };

  const handleSelectCreator = (username: string) => { setInspectedCreator(username); setMessageRecipient(null); setCurrentTab('profile'); };

  const handleMessageUser = async (profile: UserPublicProfile) => {
    setMessageRecipient(profile);
    setInspectedCreator(null);
    setCurrentTab('messages');
  };

  return <div className="min-h-screen bg-black text-white flex flex-col justify-between max-w-md mx-auto relative border-x border-zinc-900 shadow-2xl">
    <main className="flex-1 w-full relative">
      {currentTab === 'feed' && <FeedView key={feedRefreshKey} onOpenCreate={() => setShowCreateModal(true)} onSelectCreator={handleSelectCreator} />}
      {currentTab === 'earn' && <EarnView />}
      {currentTab === 'wallet' && <WalletView />}
      {currentTab === 'profile' && <ProfileView targetUsername={inspectedCreator || user?.username} onBack={inspectedCreator ? () => setInspectedCreator(null) : undefined} />}
      {currentTab === 'messages' && <MessagesView selectedUser={messageRecipient} onCloseSelected={() => setMessageRecipient(null)} />}
    </main>

    {currentTab === 'profile' && inspectedCreator && inspectedCreator.toLowerCase() !== user?.username?.toLowerCase() && (
      <button
        id="btn-profile-message"
        onClick={async () => {
          try {
            const res = await apiClient.getUserProfile(inspectedCreator);
            if (res.profile && res.profile.id !== user?.id) await handleMessageUser(res.profile);
          } catch (err) { console.error('[Profile] Failed to open messaging:', err); }
        }}
        className="fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-white text-black shadow-xl flex items-center justify-center border border-zinc-800"
        aria-label="Message user"
        title="Message user"
      ><MessageCircle className="w-5 h-5" /></button>
    )}

    <Navigation currentTab={currentTab} onSelectTab={handleSelectTab} />
    {showCreateModal && <PostCreationModal onClose={() => setShowCreateModal(false)} onPostCreated={() => { setFeedRefreshKey(prev => prev + 1); setCurrentTab('feed'); }} />}
  </div>;
}

export default function App() { return <AuthProvider><SphereMain /></AuthProvider>; }
