import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Plus, Loader2, Check, Trash2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<'forYou' | 'following'>('forYou');
  const feedContainerRef = useRef<HTMLDivElement | null>(null);

  const showToast = (message: string) => {
    setToastNotice(message);
    window.setTimeout(() => setToastNotice(null), 2500);
  };

  const fetchPosts = async (pageNum: number, refresh = false, targetFeed: 'forYou' | 'following' = feedMode) => {
    if (pageNum === 1) setLoading(true);
    try {
      const res = await apiClient.getPosts(pageNum, 8, undefined, targetFeed);
      setPosts((prev) => (refresh || pageNum === 1 ? res.posts : [...prev, ...res.posts]));
      setHasMore(res.hasMore);
      setPage(res.page);
    } catch (error) {
      console.error('[Feed] Failed to fetch posts:', error);
      showToast('Unable to load the Sphere feed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPosts(1, true, 'forYou');
  }, []);

  const handleLike = async (post: Post) => {
    if (!user) {
      showToast('Please sign in to like posts.');
      return;
    }

    const previousLiked = Boolean(post.hasLiked);
    const nextLiked = !previousLiked;
    setPosts((prev) => prev.map((p) => p.id === post.id
      ? { ...p, hasLiked: nextLiked, likesCount: nextLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1) }
      : p));

    try {
      const result = await apiClient.toggleLike(post.id);
      setPosts((prev) => prev.map((p) => p.id === post.id
        ? { ...p, hasLiked: result.hasLiked, likesCount: result.likesCount }
        : p));
    } catch {
      setPosts((prev) => prev.map((p) => p.id === post.id
        ? { ...p, hasLiked: previousLiked, likesCount: post.likesCount }
        : p));
      showToast('Like could not be saved.');
    }
  };

  const handleFollow = async (post: Post) => {
    if (!user) {
      showToast('Please sign in to follow creators.');
      return;
    }
    if (user.id === post.userId) return;

    const previous = Boolean(post.isFollowingAuthor);
    const next = !previous;
    setPosts((prev) => prev.map((p) => p.userId === post.userId ? { ...p, isFollowingAuthor: next } : p));

    try {
      const result = await apiClient.toggleFollow(post.userId);
      setPosts((prev) => prev.map((p) => p.userId === post.userId ? { ...p, isFollowingAuthor: result.isFollowing } : p));
    } catch {
      setPosts((prev) => prev.map((p) => p.userId === post.userId ? { ...p, isFollowingAuthor: previous } : p));
      showToast('Follow could not be saved.');
    }
  };

  const handleShare = async (post: Post) => {
    const shareUrl = `${window.location.origin}/#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Sphere post by @${post.author.username}`, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedPostId(post.id);
        window.setTimeout(() => setCopiedPostId(null), 2000);
      }
    } catch {
      // User cancelled native sharing or clipboard was unavailable.
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await apiClient.deletePost(postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
      showToast('Post deleted successfully.');
    } catch (error: any) {
      showToast(error?.message || 'Failed to delete post.');
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
          <span className="font-bold tracking-wider text-sm text-white">Sphere</span>
          <div className="flex items-center space-x-4 text-xs">
            {(['forYou', 'following'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => { setFeedMode(mode); void fetchPosts(1, true, mode); }}
                className={`font-semibold pb-1 border-b-2 ${feedMode === mode ? 'text-white border-white' : 'text-zinc-500 border-transparent'}`}>
                {mode === 'forYou' ? 'For You' : 'Following'}
              </button>
            ))}
          </div>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400">
          <Plus className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{feedMode === 'following' ? 'No Following Posts Yet' : 'No Posts Yet'}</h2>
        <p className="text-xs text-zinc-400 max-w-xs mb-6 leading-relaxed">
          {feedMode === 'following' ? 'Follow creators to see their posts here.' : 'Publish the first image post on Sphere.'}
        </p>
        <button onClick={feedMode === 'following' ? () => { setFeedMode('forYou'); void fetchPosts(1, true, 'forYou'); } : onOpenCreate}
          className="px-6 py-3 rounded-xl bg-white text-black font-semibold text-xs tracking-wide">
          {feedMode === 'following' ? 'Explore For You Feed' : 'Create First Post'}
        </button>
      </div>
    );
  }

  return (
    <div ref={feedContainerRef} id="sphere-feed-scroll"
      className="h-[calc(100dvh-4rem)] w-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory bg-black text-white relative select-none scrollbar-none">
      {posts.map((post) => (
        <article key={post.id} id={`post-card-${post.id}`} className="h-[calc(100dvh-4rem)] w-full snap-start relative flex flex-col justify-between overflow-hidden bg-black">
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <img src={post.imageUrl} alt={post.caption || 'Sphere post image'} loading="lazy" referrerPolicy="no-referrer"
              className="w-full h-full object-cover sm:object-contain select-none pointer-events-auto" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
          </div>

          <div className="relative z-10 p-4 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
              <span className="font-bold tracking-wider text-sm drop-shadow-md">Sphere</span>
              <div className="flex items-center space-x-3 text-xs bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                {(['forYou', 'following'] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => { if (feedMode !== mode) { setFeedMode(mode); void fetchPosts(1, true, mode); } }}
                    className={`font-semibold pb-0.5 border-b-2 ${feedMode === mode ? 'text-white border-white' : 'text-zinc-400 border-transparent'}`}>
                    {mode === 'forYou' ? 'For You' : 'Following'}
                  </button>
                ))}
              </div>
            </div>
            {toastNotice && <div className="px-3 py-1 rounded-full bg-black/80 border border-zinc-700 text-white text-[11px] shadow-lg">{toastNotice}</div>}
          </div>

          <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center space-y-5">
            <div className="relative mb-2">
              <button onClick={() => onSelectCreator(post.author.username)} className="w-11 h-11 rounded-full border-2 border-white/90 overflow-hidden bg-zinc-900 shadow-md block">
                <img src={post.author.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(post.author.username)}`} alt={post.author.username} className="w-full h-full object-cover" />
              </button>
              {user && user.id !== post.userId && !post.isFollowingAuthor && (
                <button onClick={() => void handleFollow(post)} title="Follow creator" className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                  <Plus className="w-3 h-3 stroke-[3]" />
                </button>
              )}
            </div>

            <div className="flex flex-col items-center">
              <button onClick={() => void handleLike(post)} aria-label="Like post" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-125 transition-transform">
                <Heart className={`w-7 h-7 drop-shadow-md ${post.hasLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} strokeWidth={post.hasLiked ? 0 : 2} />
              </button>
              <span className="text-[11px] font-semibold text-white/90 mt-0.5 drop-shadow">{post.likesCount}</span>
            </div>

            <div className="flex flex-col items-center">
              <button onClick={() => setActiveCommentsPostId(post.id)} aria-label="Open comments" className="w-10 h-10 rounded-full flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-white drop-shadow-md" />
              </button>
              <span className="text-[11px] font-semibold text-white/90 mt-0.5 drop-shadow">{post.commentsCount}</span>
            </div>

            <div className="flex flex-col items-center">
              <button onClick={() => void handleShare(post)} aria-label="Share post" className="w-10 h-10 rounded-full flex items-center justify-center text-white">
                {copiedPostId === post.id ? <Check className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
              </button>
              <span className="text-[10px] text-white/80 mt-0.5">{copiedPostId === post.id ? 'Copied' : 'Share'}</span>
            </div>

            {user && user.id === post.userId && (
              <div className="flex flex-col items-center">
                <button onClick={() => void handleDeletePost(post.id)} aria-label="Delete post" className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-red-400">
                  <Trash2 className="w-5 h-5" />
                </button>
                <span className="text-[10px] text-zinc-400 mt-0.5">Delete</span>
              </div>
            )}
          </div>

          <div className="relative z-10 px-4 pb-4 pr-16 text-left">
            <div className="flex items-center space-x-2 mb-1.5">
              <button onClick={() => onSelectCreator(post.author.username)} className="font-bold text-sm tracking-tight text-white hover:underline drop-shadow">@{post.author.username}</button>
              {post.author.displayName && post.author.displayName !== post.author.username && <span className="text-xs text-zinc-400 drop-shadow">• {post.author.displayName}</span>}
            </div>
            {post.caption && <p className="text-xs text-zinc-100 line-clamp-3 leading-relaxed drop-shadow font-normal">{post.caption}</p>}
          </div>
        </article>
      ))}

      {hasMore && (
        <div className="h-20 flex items-center justify-center text-xs text-zinc-500">
          <button onClick={() => void fetchPosts(page + 1)} className="px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white">Load More Posts</button>
        </div>
      )}

      {activeCommentsPostId && (
        <CommentsDrawer postId={activeCommentsPostId} onClose={() => setActiveCommentsPostId(null)}
          onCommentAdded={() => setPosts((prev) => prev.map((p) => p.id === activeCommentsPostId ? { ...p, commentsCount: p.commentsCount + 1 } : p))}
          onCommentRemoved={() => setPosts((prev) => prev.map((p) => p.id === activeCommentsPostId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p))} />
      )}
    </div>
  );
};
