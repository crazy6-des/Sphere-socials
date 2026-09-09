import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, Trash2 } from 'lucide-react';
import { Comment } from '../types';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';

interface CommentsDrawerProps {
  postId: string;
  onClose: () => void;
  onCommentAdded: () => void;
  onCommentRemoved?: () => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({ postId, onClose, onCommentAdded, onCommentRemoved }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchComments() {
      setLoading(true);
      try {
        const res = await apiClient.getComments(postId);
        if (isMounted) setComments(res.comments);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load comments');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchComments();
    return () => {
      isMounted = false;
    };
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.addComment(postId, newComment.trim());
      setComments((prev) => [...prev, res.comment]);
      setNewComment('');
      onCommentAdded();
    } catch (err: any) {
      setError(err.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await apiClient.deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentRemoved?.();
    } catch (err: any) {
      setError(err.message || 'Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div
      id="comments-drawer-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="comments-drawer-panel"
        className="w-full max-w-md mx-auto bg-zinc-950 border-t border-zinc-800 rounded-t-2xl h-[65vh] flex flex-col overflow-hidden text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 shrink-0">
          <span className="text-xs font-semibold tracking-wider text-zinc-300">
            Comments ({comments.length})
          </span>
          <button
            id="btn-close-comments-drawer"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-zinc-500 text-xs">
              <p>No comments yet.</p>
              <p className="mt-1 text-zinc-600">Be the first to share your thoughts.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start space-x-3 text-xs">
                <img
                  src={comment.author.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${comment.author.username}`}
                  alt={comment.author.username}
                  className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2">
                    <span className="font-semibold text-zinc-200">
                      @{comment.author.username}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(comment.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-zinc-300 mt-0.5 break-words leading-relaxed">
                    {comment.content}
                  </p>
                </div>
                {user && user.id === comment.userId && (
                  <button
                    type="button"
                    id={`btn-delete-comment-${comment.id}`}
                    onClick={() => handleDelete(comment.id)}
                    disabled={deletingCommentId === comment.id}
                    title="Delete your comment"
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    {deletingCommentId === comment.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-900 bg-zinc-950 flex items-center space-x-2 shrink-0">
          <input
            id="input-comment-text"
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={user ? 'Add a comment...' : 'Log in to comment'}
            disabled={!user || submitting}
            className="flex-1 px-3.5 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <button
            id="btn-submit-comment"
            type="submit"
            disabled={!user || !newComment.trim() || submitting}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0 disabled:opacity-30 active:scale-95 transition-all"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
