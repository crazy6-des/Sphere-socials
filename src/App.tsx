import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navigation, TabType } from './components/Navigation';
import { LandingView } from './components/LandingView';
import { FeedView } from './components/FeedView';
import { EarnView } from './components/EarnView';
import { WalletView } from './components/WalletView';
import { ProfileView } from './components/ProfileView';
import { PostCreationModal } from './components/PostCreationModal';
import { Loader2 } from 'lucide-react';

function SphereMain() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('feed');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [inspectedCreator, setInspectedCreator] = useState<string | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState<number>(0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center font-bold text-sm mb-4">
          S
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  // If user is not authenticated, show public scrollable landing page
  if (!isAuthenticated) {
    return <LandingView onSuccessAuth={() => setCurrentTab('feed')} />;
  }

  // Authenticated Sphere Application
  const handleSelectTab = (tab: TabType) => {
    if (tab === 'create') {
      setShowCreateModal(true);
      return;
    }
    setInspectedCreator(null);
    setCurrentTab(tab);
  };

  const handleSelectCreator = (username: string) => {
    setInspectedCreator(username);
    setCurrentTab('profile');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between max-w-md mx-auto relative border-x border-zinc-900 shadow-2xl">
      {/* Active Tab View */}
      <main className="flex-1 w-full relative">
        {currentTab === 'feed' && (
          <FeedView
            key={feedRefreshKey}
            onOpenCreate={() => setShowCreateModal(true)}
            onSelectCreator={handleSelectCreator}
          />
        )}

        {currentTab === 'earn' && <EarnView />}

        {currentTab === 'wallet' && <WalletView />}

        {currentTab === 'profile' && (
          <ProfileView
            targetUsername={inspectedCreator || user?.username}
            onBack={inspectedCreator ? () => setInspectedCreator(null) : undefined}
          />
        )}
      </main>

      {/* Persistent Bottom Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
      />

      {/* Creation Modal for Central "+" Action */}
      {showCreateModal && (
        <PostCreationModal
          onClose={() => setShowCreateModal(false)}
          onPostCreated={() => {
            setFeedRefreshKey((prev) => prev + 1);
            setCurrentTab('feed');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SphereMain />
    </AuthProvider>
  );
}
