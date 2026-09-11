import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Loader2, AlertCircle, Eye } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface PostCreationModalProps {
  onClose: () => void;
  onPostCreated: () => void;
}

export const PostCreationModal: React.FC<PostCreationModalProps> = ({ onClose, onPostCreated }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      setError('Video uploads are not supported. Please select an image.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Allowed image formats: JPG, PNG, WEBP, GIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image exceeds the 5MB size limit.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePublish = async () => {
    if (!selectedFile) {
      setError('Please choose an image to publish.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // Persistence remains server-authoritative: image upload goes through the Worker/R2 API,
      // then the Worker creates the D1-backed post. No client-side post persistence is used.
      const uploadRes = await apiClient.uploadImage(selectedFile);
      await apiClient.createPost({
        imageUrl: uploadRes.url,
        caption: caption.trim() || undefined,
      });
      onPostCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="post-creation-modal-overlay" className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4">
      <div id="post-creation-panel" className="w-full max-w-md h-full sm:h-[85vh] bg-zinc-950 border-x sm:border border-zinc-800 sm:rounded-2xl flex flex-col overflow-hidden text-white relative">
        <header className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            {isPreviewMode && (
              <button type="button" onClick={() => setIsPreviewMode(false)} className="p-1 text-zinc-400 hover:text-white" aria-label="Back to edit">
                <X className="w-5 h-5 rotate-45" />
              </button>
            )}
            <h2 className="text-sm font-bold tracking-tight">{isPreviewMode ? 'Post Preview' : 'Create Sphere Post'}</h2>
          </div>
          <button id="btn-close-create-modal" type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </header>

        {error && (
          <div className="mx-4 mt-3 p-3 rounded-lg bg-red-950/40 border border-red-800/60 flex items-start space-x-2 text-red-200 text-xs shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isPreviewMode ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-black">
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {previewUrl && <img src={previewUrl} alt="Post preview" className="w-full h-full object-cover" />}
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 right-4 text-left">
                <p className="text-xs font-bold text-white mb-1">Your Sphere post</p>
                {caption.trim() && <p className="text-xs text-zinc-200 whitespace-pre-wrap line-clamp-4">{caption.trim()}</p>}
              </div>
            </div>
            <div className="p-4 border-t border-zinc-900 bg-zinc-950 flex space-x-3 shrink-0">
              <button type="button" onClick={() => setIsPreviewMode(false)} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300">
                Back to Edit
              </button>
              <button id="btn-publish-post-from-preview" type="button" onClick={() => void handlePublish()} disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-white text-black text-xs font-semibold disabled:opacity-50 flex items-center justify-center space-x-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Publish Now</span>}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-5">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">1. Image Media (No Video) *</label>
              <input ref={fileInputRef} id="file-upload-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} className="hidden" />
              {previewUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 aspect-square max-h-72 mx-auto group">
                  <img src={previewUrl} alt="Uploaded thumbnail" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-3 transition-opacity">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-semibold">Change</button>
                    <button type="button" onClick={clearImage} className="p-1.5 rounded-lg bg-red-600/90 text-white" aria-label="Remove image"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-zinc-800 hover:border-zinc-600 rounded-2xl p-8 text-center bg-zinc-900/30 flex flex-col items-center justify-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400"><Upload className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-zinc-200">Click to select an image</span>
                  <span className="text-[11px] text-zinc-500">JPG, PNG, WEBP, GIF up to 5MB</span>
                </button>
              )}
            </div>

            <div>
              <label htmlFor="input-post-caption" className="block text-xs font-medium text-zinc-400 mb-1.5">2. Caption / Description</label>
              <textarea id="input-post-caption" rows={4} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2000}
                placeholder="Write an accompanying caption for your image..." className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none" />
              <p className="text-[10px] text-zinc-600 text-right mt-1">{caption.length}/2000</p>
            </div>

            <div className="mt-auto pt-2 flex space-x-3">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300">Cancel</button>
              <button id="btn-preview-post" type="button" disabled={!selectedFile} onClick={() => { setError(null); setIsPreviewMode(true); }}
                className="flex-1 py-3 rounded-xl bg-white text-black text-xs font-semibold disabled:opacity-40 flex items-center justify-center space-x-2">
                <Eye className="w-4 h-4" /><span>Preview</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
