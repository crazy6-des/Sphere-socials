import React, { useState, useEffect } from 'react';
import { User, LogOut, Grid, Heart, MessageCircle, Music, Shield, ArrowLeft, Loader2, KeyRound, Check, Lock } from 'lucide-react';
import { UserPublicProfile, Post } from '../types';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';

interface ProfileViewProps {
  targetUsername?: string;
  onBack?: () => void;
  onSelectPost?: (post: Post) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ targetUsername, onBack }) => {
  const { user: authUser, logout, changePassword } = useAuth();
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // Change password modal states
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [isUpdatingPw, setIsUpdatingPw] = useState<boolean>(false);

  const isOwnProfile = !targetUsername || (authUser && authUser.username === targetUsername);
  const activeUsername = targetUsername || authUser?.username;

  useEffect(() => {
    async function loadProfile() {
      if (!activeUsername) return;
      setLoading(true);
      try {
        const res = await apiClient.getUserProfile(activeUsername);
        setProfile(res.profile);
        setIsFollowing(Boolean(res.profile.isFollowing));

        // Fetch user's posts
        const postsRes = await apiClient.getPosts(1, 20, res.profile.id);
        setPosts(postsRes.posts);
      } catch (err) {
        console.error('[Profile] Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [activeUsername]);

  const handleToggleFollow = async () => {
    if (!profile || isOwnProfile) return;
    try {
      const res = await apiClient.toggleFollow(profile.id);
      setIsFollowing(res.isFollowing);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              followersCount: res.isFollowing ? prev.followersCount + 1 : Math.max(0, prev.followersCount - 1),
            }
          : prev
      );
    } catch (err) {
      console.error('[Profile] Failed to follow:', err);
    }
  };

  if (loading && !profile) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-black text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin text-white mr-2" />
        <span className="text-xs font-mono">LOADING PROFILE</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-black text-zinc-500 text-xs text-center p-6">
        <p>Profile not found.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white"
          >
            Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      id="sphere-profile-view"
      className="min-h-[calc(100dvh-4rem)] bg-black text-white px-4 py-4 max-w-md mx-auto pb-20 overflow-y-auto select-none"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="text-sm font-bold tracking-tight">@{profile.username}</span>
        </div>

        {isOwnProfile && (
          <button
            id="btn-logout"
            onClick={logout}
            className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded-lg border border-zinc-900 hover:border-zinc-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        )}
      </div>

      {/* Avatar & Display Name */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-20 h-20 rounded-full border-2 border-zinc-800 overflow-hidden bg-zinc-900 mb-3 shadow-xl">
          <img
            src={
              profile.avatarUrl ||
              `https://api.dicebear.com/7.x/identicon/svg?seed=${profile.username}`
            }
            alt={profile.username}
            className="w-full h-full object-cover"
          />
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">{profile.displayName}</h2>
        <p className="text-xs text-zinc-400 mt-0.5">@{profile.username}</p>
        {profile.bio && <p className="text-xs text-zinc-300 mt-2 max-w-xs">{profile.bio}</p>}

        {/* Follow / Edit Profile Button */}
        <div className="mt-4 w-full max-w-xs">
          {!isOwnProfile ? (
            <button
              id="btn-profile-follow"
              onClick={handleToggleFollow}
              className={`w-full py-2 rounded-xl text-xs font-semibold transition-all ${
                isFollowing
                  ? 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-400 text-[11px]">
                <Shield className="w-3 h-3 text-zinc-300" />
                <span>Verified Persistent Account</span>
              </div>
              <button
                id="btn-open-change-password"
                type="button"
                onClick={() => {
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setPwError(null);
                  setPwSuccess(null);
                  setShowPasswordModal(true);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors"
              >
                <KeyRound className="w-3 h-3 text-zinc-400" />
                <span>Change Password</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Counter */}
      <div className="grid grid-cols-4 gap-2 p-3 rounded-2xl bg-zinc-950 border border-zinc-900 text-center mb-6">
        <div>
          <span className="block text-sm font-bold text-white font-mono">{profile.postsCount}</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Posts</span>
        </div>
        <div>
          <span className="block text-sm font-bold text-white font-mono">{profile.followersCount}</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Followers</span>
        </div>
        <div>
          <span className="block text-sm font-bold text-white font-mono">{profile.followingCount}</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Following</span>
        </div>
        <div>
          <span className="block text-sm font-bold text-white font-mono">
            {profile.totalLikesReceived}
          </span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Likes</span>
        </div>
      </div>

      {/* Posts Section */}
      <div className="mb-3 flex items-center justify-between border-b border-zinc-900 pb-2">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-zinc-300">
          <Grid className="w-4 h-4" />
          <span>Uploaded Posts ({posts.length})</span>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="p-8 text-center text-zinc-500 text-xs">
          <p>No posts published yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {posts.map((post) => (
            <div
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="aspect-square bg-zinc-900 rounded-lg overflow-hidden relative cursor-pointer group"
            >
              <img
                src={post.imageUrl}
                alt={post.caption || 'User post'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-2 text-white text-xs font-semibold transition-opacity">
                <div className="flex items-center space-x-0.5">
                  <Heart className="w-3.5 h-3.5 fill-white" />
                  <span>{post.likesCount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Detail Modal if clicked */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-square w-full bg-black relative">
              <img
                src={selectedPost.imageUrl}
                alt="Post view"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setSelectedPost(null)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90"
              >
                ✕
              </button>
            </div>
            <div className="p-4 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold">@{selectedPost.author.username}</span>
                <span className="text-[10px] text-zinc-500">
                  {new Date(selectedPost.createdAt).toLocaleDateString()}
                </span>
              </div>
              {selectedPost.caption && (
                <p className="text-zinc-300 mb-3">{selectedPost.caption}</p>
              )}
              {selectedPost.song && (
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
                  <Music className="w-3 h-3" />
                  <span>
                    {selectedPost.song.title} — {selectedPost.song.artist}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          id="change-password-modal-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-white shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold tracking-tight">Change Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-zinc-500 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            {pwError && (
              <div className="mb-3.5 p-2.5 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs">
                {pwError}
              </div>
            )}

            {pwSuccess && (
              <div className="mb-3.5 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{pwSuccess}</span>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPwError(null);
                setPwSuccess(null);

                if (!currentPassword) {
                  setPwError('Current password is required.');
                  return;
                }
                if (!newPassword || newPassword.length < 6) {
                  setPwError('New password must be at least 6 characters.');
                  return;
                }
                if (newPassword !== confirmPassword) {
                  setPwError('New passwords do not match.');
                  return;
                }

                setIsUpdatingPw(true);
                try {
                  const res = await changePassword({ currentPassword, newPassword });
                  setPwSuccess(res.message || 'Password updated successfully!');
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setTimeout(() => {
                    setShowPasswordModal(false);
                    setPwSuccess(null);
                  }, 1500);
                } catch (err: any) {
                  setPwError(err.message || 'Failed to update password.');
                } finally {
                  setIsUpdatingPw(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Current Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    id="input-current-password"
                    type="password"
                    required
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">New Password *</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    id="input-change-new-password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Confirm New Password *</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                  <input
                    id="input-change-confirm-password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="w-1/3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-change-password"
                  type="submit"
                  disabled={isUpdatingPw}
                  className="w-2/3 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {isUpdatingPw ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
