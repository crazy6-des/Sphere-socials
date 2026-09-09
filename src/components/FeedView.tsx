import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Share2, Music, Volume2, VolumeX, Plus, Loader2, Check, Trash2 } from 'lucide-react';
import { Post } from '../types';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { CommentsDrawer } from './CommentsDrawer';

interface FeedViewProps {
  onOpenCreate: () => void;
  onSelectCreator: (username: string) => void;
}

export const FeedView: React.FC<FeedViewProps> = ({ onOpenCreate, onSelectCreator }) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(null), 2500);
  };

  const [feedMode, setFeedMode] = useState<'forYou' | 'following'>('forYou');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedContainerRef = useRef<HTMLDivElement | null>(null);

  // Load feed posts
  const fetchPosts = async (pageNum: number, refresh = false, targetFeed = feedMode) => {
    if (pageNum === 1 && (refresh || posts.length === 0)) setLoading(true);
    try {
      const res = await apiClient.getPosts(pageNum, 8, undefined, targetFeed);
      setPosts((prev) => (refresh || pageNum === 1 ? res.posts : [...prev, ...res.posts]));
      setHasMore(res.hasMore);
      setPage(res.page);
    } catch (err) {
      console.error('[Feed] Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts(1, true, feedMode);
  }, []);

  // Handle Like
  const handleLike = async (post: Post) => {
    if (!user) {
      showToast('Please sign in to like posts.');
      return;
    }

    // Optimistic UI update
    const nextHasLiked = !post.hasLiked;
    const nextLikesCount = nextHasLiked ? post.likesCount + 1 : Math.max(0, post.likesCount - 1);

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, hasLiked: nextHasLiked, likesCount: nextLikesCount } : p
      )
    );

    try {
      const res = await apiClient.toggleLike(post.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, hasLiked: res.hasLiked, likesCount: res.likesCount } : p
        )
      );
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, hasLiked: post.hasLiked, likesCount: post.likesCount } : p))
      );
    }
  };

  // Handle Follow
  const handleFollow = async (post: Post) => {
    if (!user) {
      showToast('Please sign in to follow creators.');
      return;
    }
    if (user.id === post.userId) return;

    const nextIsFollowing = !post.isFollowingAuthor;
    setPosts((prev) =>
      prev.map((p) =>
        p.userId === post.userId ? { ...p, isFollowingAuthor: nextIsFollowing } : p
      )
    );

    try {
      const res = await apiClient.toggleFollow(post.userId);
      setPosts((prev) =>
        prev.map((p) =>
          p.userId === post.userId ? { ...p, isFollowingAuthor: res.isFollowing } : p
        )
      );
    } catch {
      // Revert
      setPosts((prev) =>
        prev.map((p) =>
          p.userId === post.userId ? { ...p, isFollowingAuthor: post.isFollowingAuthor } : p
        )
      );
    }
  };

  // Handle Audio Tag Playback
  const toggleSongAudio = (previewUrl?: string) => {
    if (!previewUrl) return;

    if (activeAudioUrl === previewUrl && isPlayingAudio) {
      audioRef.current?.pause();
      setIsPlayingAudio(false);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(previewUrl);
      audioRef.current = audio;
      setActiveAudioUrl(previewUrl);
      setIsPlayingAudio(true);

      audio.play().catch(() => {
        setIsPlayingAudio(false);
      });

      audio.onended = () => {
        setIsPlayingAudio(false);
      };
    }
  };

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle Share / Copy Link
  const handleShare = async (post: Post) => {
    const shareUrl = `${window.location.origin}/#post-${post.id}`;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedPostId(post.id);
        setTimeout(() => setCopiedPostId(null), 2000);
      } catch {
        // ignore
      }
    }
  };

  // Handle Delete Post (Creator ownership)
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await apiClient.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast('Post deleted successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete post.');
    }
  };

  if (loading && posts.length === 0) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-black text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
        <p className="text-xs font-mono tracking-wider">LOADING SPHERE FEED</p>
      </div>
    );
  }

  if (!loading && posts.length === 0) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-black text-center px-6 max-w-md mx-auto relative">
        <div className="absolute top-4 inset-x-4 flex items-center justify-between z-20">
          <span className="font-bold tracking-wider text-sm drop-shadow-md text-white">Sphere</span>
          <div className="flex items-center space-x-4 text-xs">
            <button
              type="button"
              id="tab-empty-foryou"
              onClick={() => {
                setFeedMode('forYou');
                fetchPosts(1, true, 'forYou');
              }}
              className={`font-semibold pb-1 transition-colors border-b-2 ${
                feedMode === 'forYou' ? 'text-white border-white' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              For You
            </button>
            <button
              type="button"
              id="tab-empty-following"
              onClick={() => {
                setFeedMode('following');
                fetchPosts(1, true, 'following');
              }}
              className={`font-semibold pb-1 transition-colors border-b-2 ${
                feedMode === 'following' ? 'text-white border-white' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              Following
            </button>
          </div>
        </div>

        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400">
          <Plus className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {feedMode === 'following' ? 'No Following Posts Yet' : 'No Posts Yet'}
        </h2>
        <p className="text-xs text-zinc-400 max-w-xs mb-6 leading-relaxed">
          {feedMode === 'following'
            ? 'Follow your favorite creators by tapping the follow icon on their profile or in the For You feed to see their posts here.'
            : 'The Sphere feed is empty. Be the pioneer creator by publishing the very first image with soundtrack tags.'}
        </p>
        <button
          id="btn-empty-feed-create"
          onClick={feedMode === 'following' ? () => { setFeedMode('forYou'); fetchPosts(1, true, 'forYou'); } : onOpenCreate}
          className="px-6 py-3 rounded-xl bg-white text-black font-semibold text-xs tracking-wide hover:bg-zinc-200 active:scale-95 transition-all"
        >
          {feedMode === 'following' ? 'Explore For You Feed' : 'Create First Post'}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={feedContainerRef}
      id="sphere-feed-scroll"
      className="h-[calc(100dvh-4rem)] w-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory bg-black text-white relative select-none scrollbar-none"
    >
      {posts.map((post) => (
        <article
          key={post.id}
          id={`post-card-${post.id}`}
          className="h-[calc(100dvh-4rem)] w-full snap-start relative flex flex-col justify-between overflow-hidden bg-black"
        >
          {/* Centered Visual Media (Content Dominates) */}
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <img
              src={post.imageUrl}
              alt={post.caption || 'Sphere post image'}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover sm:object-contain select-none pointer-events-auto"
            />
            {/* Subtle Gradient Overlays for High Contrast Readability */}
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
          </div>

          {/* Top Brand Marker & Feed Mode Switcher */}
          <div className="relative z-10 p-4 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
              <span className="font-bold tracking-wider text-sm drop-shadow-md">Sphere</span>
              <div className="flex items-center space-x-3 text-xs bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                <button
                  type="button"
                  id="tab-feed-foryou"
                  onClick={() => {
                    if (feedMode !== 'forYou') {
                      setFeedMode('forYou');
                      fetchPosts(1, true, 'forYou');
                    }
                  }}
                  className={`font-semibold transition-colors pb-0.5 border-b-2 ${
                    feedMode === 'forYou' ? 'text-white border-white' : 'text-zinc-400 border-transparent hover:text-zinc-200'
                  }`}
                >
                  For You
                </button>
                <button
                  type="button"
                  id="tab-feed-following"
                  onClick={() => {
                    if (feedMode !== 'following') {
                      setFeedMode('following');
                      fetchPosts(1, true, 'following');
                    }
                  }}
                  className={`font-semibold transition-colors pb-0.5 border-b-2 ${
                    feedMode === 'following' ? 'text-white border-white' : 'text-zinc-400 border-transparent hover:text-zinc-200'
                  }`}
                >
                  Following
                </button>
              </div>
            </div>
            {toastNotice && (
              <div className="px-3 py-1 rounded-full bg-black/80 border border-zinc-700 text-white text-[11px] shadow-lg animate-fade-in">
                {toastNotice}
              </div>
            )}
          </div>

          {/* Right Interaction Rail (Heart, Comment, Share) */}
          <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center space-y-5">
            {/* Creator Avatar with Follow Button */}
            <div className="relative mb-2">
              <button
                onClick={() => onSelectCreator(post.author.username)}
                className="w-11 h-11 rounded-full border-2 border-white/90 overflow-hidden bg-zinc-900 shadow-md block"
              >
                <img
                  src={
                    post.author.avatarUrl ||
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${post.author.username}`
                  }
                  alt={post.author.username}
                  className="w-full h-full object-cover"
                />
              </button>
              {user && user.id !== post.userId && !post.isFollowingAuthor && (
                <button
                  id={`btn-follow-${post.id}`}
                  onClick={() => handleFollow(post)}
                  title="Follow creator"
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform"
                >
                  <Plus className="w-3 h-3 text-black stroke-[3]" />
                </button>
              )}
            </div>

            {/* Like Button */}
            <div className="flex flex-col items-center">
              <button
                id={`btn-like-${post.id}`}
                onClick={() => handleLike(post)}
                aria-label="Like post"
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-125 transition-transform"
              >
                <Heart
                  className={`w-7 h-7 drop-shadow-md transition-colors ${
                    post.hasLiked ? 'fill-red-500 text-red-500' : 'text-white'
                  }`}
                  strokeWidth={post.hasLiked ? 0 : 2}
                />
              </button>
              <span className="text-[11px] font-semibold text-white/90 mt-0.5 drop-shadow">
                {post.likesCount}
              </span>
            </div>

            {/* Comment Button */}
            <div className="flex flex-col items-center">
              <button
                id={`btn-comments-${post.id}`}
                onClick={() => setActiveCommentsPostId(post.id)}
                aria-label="Open comments"
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-110 transition-transform"
              >
                <MessageCircle className="w-7 h-7 text-white drop-shadow-md" strokeWidth={2} />
              </button>
              <span className="text-[11px] font-semibold text-white/90 mt-0.5 drop-shadow">
                {post.commentsCount}
              </span>
            </div>

            {/* Share / Link Button */}
            <div className="flex flex-col items-center">
              <button
                id={`btn-share-${post.id}`}
                onClick={() => handleShare(post)}
                aria-label="Share post"
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-110 transition-transform text-white"
              >
                {copiedPostId === post.id ? (
                  <Check className="w-6 h-6 text-emerald-400" />
                ) : (
                  <Share2 className="w-6 h-6 text-white drop-shadow-md" strokeWidth={2} />
                )}
              </button>
              <span className="text-[10px] text-white/80 mt-0.5 drop-shadow">
                {copiedPostId === post.id ? 'Copied' : 'Share'}
              </span>
            </div>

            {/* Delete Post Button (Owner only) */}
            {user && user.id === post.userId && (
              <div className="flex flex-col items-center">
                <button
                  id={`btn-delete-post-${post.id}`}
                  onClick={() => handleDeletePost(post.id)}
                  aria-label="Delete post"
                  title="Delete post"
                  className="w-10 h-10 rounded-full flex items-center justify-center active:scale-110 transition-transform text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="w-5 h-5 drop-shadow-md" strokeWidth={2} />
                </button>
                <span className="text-[10px] text-zinc-400 mt-0.5 drop-shadow">
                  Delete
                </span>
              </div>
            )}
          </div>

          {/* Bottom Overlay: Creator info, Caption, and Song Tag */}
          <div className="relative z-10 px-4 pb-4 pr-16 text-left">
            {/* Creator Username */}
            <div className="flex items-center space-x-2 mb-1.5">
              <button
                onClick={() => onSelectCreator(post.author.username)}
                className="font-bold text-sm tracking-tight text-white hover:underline drop-shadow"
              >
                @{post.author.username}
              </button>
              {post.author.displayName && post.author.displayName !== post.author.username && (
                <span className="text-xs text-zinc-400 drop-shadow">
                  • {post.author.displayName}
                </span>
              )}
            </div>

            {/* Caption */}
            {post.caption && (
              <p className="text-xs text-zinc-100 mb-2.5 line-clamp-3 leading-relaxed drop-shadow font-normal">
                {post.caption}
              </p>
            )}

            {/* Song Metadata Pill */}
            {post.song && (
              <button
                id={`song-pill-${post.id}`}
                onClick={() => toggleSongAudio(post.song?.previewUrl)}
                className={`inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-xs text-zinc-200 hover:bg-black/80 transition-all max-w-[85%] ${
                  isPlayingAudio && activeAudioUrl === post.song?.previewUrl ? 'border-white text-white' : ''
                }`}
              >
                <Music
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isPlayingAudio && activeAudioUrl === post.song?.previewUrl
                      ? 'animate-spin text-white'
                      : 'text-zinc-400'
                  }`}
                />
                <span className="truncate font-mono text-[11px]">
                  {post.song.title} — {post.song.artist}
                </span>
                {post.song.previewUrl && (
                  <span className="shrink-0 pl-0.5">
                    {isPlayingAudio && activeAudioUrl === post.song.previewUrl ? (
                      <Volume2 className="w-3 h-3 text-white" />
                    ) : (
                      <VolumeX className="w-3 h-3 text-zinc-400" />
                    )}
                  </span>
                )}
              </button>
            )}
          </div>
        </article>
      ))}

      {/* Infinite Scroll Trigger */}
      {hasMore && (
        <div className="h-20 flex items-center justify-center text-xs text-zinc-500">
          <button
            onClick={() => fetchPosts(page + 1)}
            className="px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
          >
            Load More Posts
          </button>
        </div>
      )}

      {/* Comments Drawer */}
      {activeCommentsPostId && (
        <CommentsDrawer
          postId={activeCommentsPostId}
          onClose={() => setActiveCommentsPostId(null)}
          onCommentAdded={() => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === activeCommentsPostId ? { ...p, commentsCount: p.commentsCount + 1 } : p
              )
            );
          }}
          onCommentRemoved={() => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === activeCommentsPostId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p
              )
            );
          }}
        />
      )}
    </div>
  );
};
