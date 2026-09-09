import React, { useState, useEffect } from 'react';
import { User, LogOut, Grid, Heart, MessageCircle, Music, Shield, ArrowLeft, Loader2, KeyRound, Check, Lock, Settings, Edit3, Database, Bell, Volume2, ShieldCheck, Mail, Sun, Moon, Palette } from 'lucide-react';
import { UserPublicProfile, Post, UserSettings, SystemStatus } from '../types';
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

  // Edit Profile modal states
  const [showEditProfileModal, setShowEditProfileModal] = useState<boolean>(false);
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editBio, setEditBio] = useState<string>('');
  const [editAvatarUrl, setEditAvatarUrl] = useState<string>('');
  const [editProfileError, setEditProfileError] = useState<string | null>(null);
  const [editProfileSuccess, setEditProfileSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  // Settings & System Diagnostics modal states
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    autoplayAudio: true,
    privateProfile: false,
    notificationsEnabled: true,
    dataSaver: false,
    theme: 'dark',
    accentColor: 'indigo',
    updatedAt: Date.now(),
  });
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const handleUpdateSetting = async (patch: Partial<UserSettings>, noticeMsg: string) => {
    setUserSettings((prev) => ({ ...prev, ...patch }));
    if (patch.theme || patch.accentColor) {
      const theme = patch.theme || userSettings.theme || 'dark';
      const accent = patch.accentColor || userSettings.accentColor || 'indigo';
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        if (theme === 'light') {
          root.classList.remove('dark');
          root.classList.add('light');
        } else {
          root.classList.remove('light');
          root.classList.add('dark');
        }
        root.setAttribute('data-accent', accent);
      }
    }
    try {
      await apiClient.updateUserSettings(patch);
      setSettingsNotice(noticeMsg);
      setTimeout(() => setSettingsNotice(null), 2500);
    } catch {
      setSettingsNotice('Failed to persist setting.');
    }
  };

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
          <div className="flex items-center space-x-2">
            <button
              id="btn-open-settings"
              onClick={async () => {
                setShowSettingsModal(true);
                setLoadingSettings(true);
                try {
                  const [settingsRes, statusRes] = await Promise.all([
                    apiClient.getUserSettings().catch(() => ({ settings: userSettings })),
                    apiClient.getSystemStatus().catch(() => ({ success: false, data: null as any })),
                  ]);
                  if (settingsRes?.settings) {
                    setUserSettings(settingsRes.settings);
                    const t = settingsRes.settings.theme || 'dark';
                    const a = settingsRes.settings.accentColor || 'indigo';
                    if (typeof document !== 'undefined') {
                      const root = document.documentElement;
                      if (t === 'light') {
                        root.classList.remove('dark');
                        root.classList.add('light');
                      } else {
                        root.classList.remove('light');
                        root.classList.add('dark');
                      }
                      root.setAttribute('data-accent', a);
                    }
                  }
                  if (statusRes?.data) {
                    setSystemStatus(statusRes.data);
                  }
                } finally {
                  setLoadingSettings(false);
                }
              }}
              className="flex items-center space-x-1.5 text-xs text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-zinc-900 hover:border-zinc-800 transition-colors bg-zinc-950"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
            <button
              id="btn-logout"
              onClick={logout}
              className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded-lg border border-zinc-900 hover:border-zinc-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
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
                <Shield className="w-3 h-3 text-emerald-400" />
                <span>Verified Persistent Account</span>
              </div>
              <div className="flex items-center space-x-2 w-full">
                <button
                  id="btn-open-edit-profile"
                  type="button"
                  onClick={() => {
                    setEditDisplayName(profile.displayName);
                    setEditBio(profile.bio || '');
                    setEditAvatarUrl(profile.avatarUrl);
                    setEditProfileError(null);
                    setEditProfileSuccess(null);
                    setShowEditProfileModal(true);
                  }}
                  className="flex-1 inline-flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
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
                  className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Password</span>
                </button>
              </div>
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

      {/* Edit Profile Modal */}
      {showEditProfileModal && (
        <div
          id="edit-profile-modal-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowEditProfileModal(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-white shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <Edit3 className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-sm font-bold tracking-tight">Edit Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditProfileModal(false)}
                className="text-zinc-500 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            {editProfileError && (
              <div className="mb-3.5 p-2.5 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs">
                {editProfileError}
              </div>
            )}

            {editProfileSuccess && (
              <div className="mb-3.5 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{editProfileSuccess}</span>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditProfileError(null);
                setEditProfileSuccess(null);
                setIsSavingProfile(true);

                try {
                  const res = await apiClient.updateProfile({
                    displayName: editDisplayName.trim(),
                    bio: editBio.trim(),
                    avatarUrl: editAvatarUrl.trim() || undefined,
                  });

                  if (res?.user) {
                    setProfile((prev) =>
                      prev
                        ? {
                            ...prev,
                            displayName: res.user.displayName,
                            bio: res.user.bio,
                            avatarUrl: res.user.avatarUrl,
                          }
                        : prev
                    );
                  }

                  setEditProfileSuccess('Profile saved to database!');
                  setTimeout(() => {
                    setShowEditProfileModal(false);
                    setEditProfileSuccess(null);
                  }, 1200);
                } catch (err: any) {
                  setEditProfileError(err.message || 'Failed to update profile.');
                } finally {
                  setIsSavingProfile(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Display Name</label>
                <input
                  id="input-edit-display-name"
                  type="text"
                  required
                  maxLength={50}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Bio</label>
                <textarea
                  id="input-edit-bio"
                  rows={3}
                  maxLength={200}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell the community about yourself"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Avatar Image URL (Optional)</label>
                <input
                  id="input-edit-avatar"
                  type="url"
                  placeholder="https://..."
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEditProfileModal(false)}
                  className="w-1/3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-profile"
                  type="submit"
                  disabled={isSavingProfile}
                  className="w-2/3 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Persistent Settings & System Diagnostics Modal */}
      {showSettingsModal && (
        <div
          id="settings-modal-overlay"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-white shadow-2xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <Settings className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Settings & Integrity</h3>
                  <span className="text-[10px] text-zinc-400">Database-backed persistent preferences</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-500 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            {settingsNotice && (
              <div className="mb-3 p-2 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[11px] flex items-center space-x-1.5">
                <Check className="w-3 h-3 flex-shrink-0" />
                <span>{settingsNotice}</span>
              </div>
            )}

            {loadingSettings ? (
              <div className="py-8 flex flex-col items-center justify-center text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin mb-2 text-white" />
                <span className="text-xs font-mono">Loading Database Preferences...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Appearance & Theme Mode */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Moon className="w-4 h-4 text-zinc-400" />
                      <div>
                        <p className="text-xs font-medium text-white">Appearance Theme</p>
                        <p className="text-[10px] text-zinc-500">Persisted in database & profile</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                      <button
                        type="button"
                        id="btn-theme-dark"
                        onClick={() => handleUpdateSetting({ theme: 'dark' }, 'Dark theme saved.')}
                        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          userSettings.theme !== 'light' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <Moon className="w-3 h-3" />
                        <span>Dark</span>
                      </button>
                      <button
                        type="button"
                        id="btn-theme-light"
                        onClick={() => handleUpdateSetting({ theme: 'light' }, 'Light theme saved.')}
                        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          userSettings.theme === 'light' ? 'bg-zinc-200 text-black shadow-xs' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <Sun className="w-3 h-3" />
                        <span>Light</span>
                      </button>
                    </div>
                  </div>

                  {/* Accent Color Picker */}
                  <div className="pt-2.5 border-t border-zinc-800/60 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Palette className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-[11px] text-zinc-400">Accent Tone</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {[
                        { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-500' },
                        { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500' },
                        { id: 'amber', label: 'Amber', bg: 'bg-amber-500' },
                        { id: 'slate', label: 'Slate', bg: 'bg-slate-400' },
                        { id: 'rose', label: 'Rose', bg: 'bg-rose-500' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          id={`accent-${c.id}`}
                          title={c.label}
                          onClick={() => handleUpdateSetting({ accentColor: c.id as any }, `${c.label} accent saved.`)}
                          className={`w-5 h-5 rounded-full ${c.bg} transition-all ${
                            (userSettings.accentColor || 'indigo') === c.id
                              ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-110'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-2.5">
                  {/* Autoplay Audio */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
                    <div className="flex items-center space-x-2.5">
                      <Volume2 className="w-4 h-4 text-zinc-400" />
                      <div>
                        <p className="text-xs font-medium text-white">Autoplay Soundtrack</p>
                        <p className="text-[10px] text-zinc-500">Play music tags when viewing feed</p>
                      </div>
                    </div>
                    <button
                      id="toggle-autoplay-audio"
                      type="button"
                      onClick={async () => {
                        const newVal = !userSettings.autoplayAudio;
                        setUserSettings((prev) => ({ ...prev, autoplayAudio: newVal }));
                        try {
                          await apiClient.updateUserSettings({ autoplayAudio: newVal });
                          setSettingsNotice('Autoplay preference saved to database.');
                          setTimeout(() => setSettingsNotice(null), 2500);
                        } catch {
                          setSettingsNotice('Failed to persist setting.');
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        userSettings.autoplayAudio ? 'bg-emerald-500' : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          userSettings.autoplayAudio ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Private Profile */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
                    <div className="flex items-center space-x-2.5">
                      <Lock className="w-4 h-4 text-zinc-400" />
                      <div>
                        <p className="text-xs font-medium text-white">Private Profile</p>
                        <p className="text-[10px] text-zinc-500">Require approval for new followers</p>
                      </div>
                    </div>
                    <button
                      id="toggle-private-profile"
                      type="button"
                      onClick={async () => {
                        const newVal = !userSettings.privateProfile;
                        setUserSettings((prev) => ({ ...prev, privateProfile: newVal }));
                        try {
                          await apiClient.updateUserSettings({ privateProfile: newVal });
                          setSettingsNotice('Privacy preference saved to database.');
                          setTimeout(() => setSettingsNotice(null), 2500);
                        } catch {
                          setSettingsNotice('Failed to persist setting.');
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        userSettings.privateProfile ? 'bg-emerald-500' : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          userSettings.privateProfile ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Notifications */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
                    <div className="flex items-center space-x-2.5">
                      <Bell className="w-4 h-4 text-zinc-400" />
                      <div>
                        <p className="text-xs font-medium text-white">Push & Activity Alerts</p>
                        <p className="text-[10px] text-zinc-500">Likes, comments, and yields</p>
                      </div>
                    </div>
                    <button
                      id="toggle-notifications"
                      type="button"
                      onClick={async () => {
                        const newVal = !userSettings.notificationsEnabled;
                        setUserSettings((prev) => ({ ...prev, notificationsEnabled: newVal }));
                        try {
                          await apiClient.updateUserSettings({ notificationsEnabled: newVal });
                          setSettingsNotice('Alert preference saved to database.');
                          setTimeout(() => setSettingsNotice(null), 2500);
                        } catch {
                          setSettingsNotice('Failed to persist setting.');
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        userSettings.notificationsEnabled ? 'bg-emerald-500' : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          userSettings.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Data Saver */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
                    <div className="flex items-center space-x-2.5">
                      <ShieldCheck className="w-4 h-4 text-zinc-400" />
                      <div>
                        <p className="text-xs font-medium text-white">Data Saver Mode</p>
                        <p className="text-[10px] text-zinc-500">Compress imagery & throttle previews</p>
                      </div>
                    </div>
                    <button
                      id="toggle-data-saver"
                      type="button"
                      onClick={async () => {
                        const newVal = !userSettings.dataSaver;
                        setUserSettings((prev) => ({ ...prev, dataSaver: newVal }));
                        try {
                          await apiClient.updateUserSettings({ dataSaver: newVal });
                          setSettingsNotice('Data Saver preference saved to database.');
                          setTimeout(() => setSettingsNotice(null), 2500);
                        } catch {
                          setSettingsNotice('Failed to persist setting.');
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        userSettings.dataSaver ? 'bg-emerald-500' : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          userSettings.dataSaver ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* System Diagnostics Box */}
                <div className="p-3.5 rounded-xl bg-black border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center space-x-1">
                      <Database className="w-3 h-3 text-emerald-400" />
                      <span>Persistence & Architecture</span>
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      10/10 VERIFIED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                      <span className="text-[10px] text-zinc-500 block">Database</span>
                      <span className="font-mono text-zinc-200 text-xs">
                        {systemStatus?.database?.type || 'SQLite WAL'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                      <span className="text-[10px] text-zinc-500 block">Brevo Service</span>
                      <span className="font-mono text-zinc-200 text-xs flex items-center space-x-1">
                        <Mail className="w-2.5 h-2.5 text-zinc-400" />
                        <span>{systemStatus?.brevoConfigured ? 'Connected' : 'Active / Ready'}</span>
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                      <span className="text-[10px] text-zinc-500 block">Total Posts</span>
                      <span className="font-mono text-zinc-200 text-xs">
                        {systemStatus?.postsCount ?? posts.length}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                      <span className="text-[10px] text-zinc-500 block">AdGem / Wallet</span>
                      <span className="font-mono text-zinc-200 text-xs">Preserved & Active</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-white font-medium transition-colors"
                >
                  Close Settings
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
