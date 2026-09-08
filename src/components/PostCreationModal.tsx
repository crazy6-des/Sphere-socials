import React, { useState, useRef } from 'react';
import { X, Upload, Music, Trash2, ArrowLeft, Loader2, AlertCircle, Eye } from 'lucide-react';
import { SongMetadata } from '../types';
import { apiClient } from '../services/apiClient';

interface PostCreationModalProps {
  onClose: () => void;
  onPostCreated: () => void;
}

export const PostCreationModal: React.FC<PostCreationModalProps> = ({ onClose, onPostCreated }) => {
  // Post states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);

  // Song search states
  const [isSearchingSong, setIsSearchingSong] = useState<boolean>(false);
  const [songQuery, setSongQuery] = useState<string>('');
  const [songResults, setSongResults] = useState<SongMetadata[]>([]);
  const [songSearchLoading, setSongSearchLoading] = useState<boolean>(false);

  // Status states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Enforce strictly images (no video)
    if (file.type.startsWith('video/')) {
      setError('Video uploads are not supported in this version. Please select an image.');
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
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  // Song search
  const handleSearchSong = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!songQuery.trim()) return;

    setSongSearchLoading(true);
    setError(null);
    try {
      const res = await apiClient.searchMusic(songQuery.trim());
      setSongResults(res.songs);
      if (res.songs.length === 0) {
        setError(`No songs found for "${songQuery}". Try another track title or artist.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to query music catalog.');
    } finally {
      setSongSearchLoading(false);
    }
  };

  // Publish
  const handlePublish = async () => {
    if (!selectedFile) {
      setError('Please choose an image to publish.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Upload image to serverless storage (R2 or persistent disk)
      const uploadRes = await apiClient.uploadImage(selectedFile);

      // Step 2: Create post with uploaded image and soundtrack metadata
      await apiClient.createPost({
        imageUrl: uploadRes.url,
        caption: caption.trim() || undefined,
        song: selectedSong,
      });

      onPostCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="post-creation-modal-overlay"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 select-none"
    >
      <div
        id="post-creation-panel"
        className="w-full max-w-md h-full sm:h-[85vh] bg-zinc-950 border-x sm:border border-zinc-800 sm:rounded-2xl flex flex-col overflow-hidden text-white relative"
      >
        {/* Top Header Bar */}
        <header className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            {isSearchingSong || isPreviewMode ? (
              <button
                onClick={() => {
                  setIsSearchingSong(false);
                  setIsPreviewMode(false);
                }}
                className="p-1 -ml-1 text-zinc-400 hover:text-white rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null}
            <h2 className="text-sm font-bold tracking-tight">
              {isPreviewMode
                ? 'Post Preview'
                : isSearchingSong
                ? 'Attach Soundtrack'
                : 'Create Sphere Post'}
            </h2>
          </div>
          <button
            id="btn-close-create-modal"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Error Notice */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded-lg bg-red-950/40 border border-red-800/60 flex items-start space-x-2 text-red-200 text-xs shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* VIEW 1: SONG SEARCH FLOW */}
        {isSearchingSong && (
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            <form onSubmit={handleSearchSong} className="flex items-center space-x-2 mb-4 shrink-0">
              <input
                id="input-search-song"
                type="text"
                autoFocus
                value={songQuery}
                onChange={(e) => setSongQuery(e.target.value)}
                placeholder="Search song title or artist..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <button
                id="btn-submit-song-search"
                type="submit"
                disabled={songSearchLoading || !songQuery.trim()}
                className="px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-xs disabled:opacity-40"
              >
                {songSearchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2">
              {songSearchLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : songResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center text-zinc-500 text-xs">
                  <Music className="w-8 h-8 mb-2 text-zinc-700" />
                  <p>Search the live catalog to tag soundtrack metadata.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Real audio metadata from open provider.</p>
                </div>
              ) : (
                songResults.map((song, idx) => (
                  <div
                    key={`${song.providerId || idx}`}
                    onClick={() => {
                      setSelectedSong(song);
                      setIsSearchingSong(false);
                    }}
                    className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-600 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {song.artworkUrl ? (
                        <img
                          src={song.artworkUrl}
                          alt={song.title}
                          className="w-10 h-10 rounded-lg object-cover bg-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                          <Music className="w-5 h-5 text-zinc-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{song.title}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{song.artist}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-white px-2.5 py-1 bg-zinc-800 rounded-lg shrink-0">
                      Select
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: PREVIEW MODE */}
        {isPreviewMode && (
          <div className="flex-1 flex flex-col overflow-hidden relative bg-black">
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Post preview"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

              {/* Overlay info */}
              <div className="absolute bottom-4 left-4 right-4 text-left">
                <p className="text-xs font-bold text-white mb-1">@your_username</p>
                {caption && <p className="text-xs text-zinc-200 mb-2">{caption}</p>}
                {selectedSong && (
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/20 text-[11px] text-zinc-300">
                    <Music className="w-3 h-3" />
                    <span>
                      {selectedSong.title} — {selectedSong.artist}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-900 bg-zinc-950 flex space-x-3 shrink-0">
              <button
                onClick={() => setIsPreviewMode(false)}
                className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Back to Edit
              </button>
              <button
                id="btn-publish-post-from-preview"
                onClick={handlePublish}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-white text-black text-xs font-semibold hover:bg-zinc-200 flex items-center justify-center space-x-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : 'Publish Now'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: MAIN CREATION FORM */}
        {!isSearchingSong && !isPreviewMode && (
          <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
            {/* Step 1: Select / Drop Image */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                1. Image Media (No Video) *
              </label>
              <input
                ref={fileInputRef}
                id="file-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />

              {previewUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 aspect-square max-h-56 mx-auto group">
                  <img
                    src={previewUrl}
                    alt="Uploaded thumbnail"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-3 transition-opacity">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-semibold"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="p-1.5 rounded-lg bg-red-600/90 text-white"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-800 hover:border-zinc-600 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-zinc-900/30 flex flex-col items-center justify-center space-y-2"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200">
                    Click to select an image
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    JPG, PNG, WEBP, GIF up to 5MB (Image-only mode)
                  </p>
                </div>
              )}
            </div>

            {/* Step 2: Add Caption */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                2. Caption / Description
              </label>
              <textarea
                id="input-post-caption"
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write an accompanying caption for your image..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            {/* Step 3: Attach Soundtrack Tag */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                3. Attached Soundtrack Tag
              </label>

              {selectedSong ? (
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    {selectedSong.artworkUrl ? (
                      <img
                        src={selectedSong.artworkUrl}
                        alt={selectedSong.title}
                        className="w-9 h-9 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-zinc-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{selectedSong.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{selectedSong.artist}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSong(null)}
                    className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  id="btn-open-song-search"
                  onClick={() => setIsSearchingSong(true)}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:border-zinc-700 flex items-center justify-center space-x-2 transition-colors"
                >
                  <Music className="w-4 h-4 text-zinc-400" />
                  <span>Search & Tag Song Metadata</span>
                </button>
              )}
            </div>

            {/* Actions: Preview & Publish */}
            <div className="pt-2 flex items-center space-x-3">
              <button
                type="button"
                id="btn-preview-post"
                onClick={() => {
                  if (!selectedFile) {
                    setError('Please select an image before previewing.');
                    return;
                  }
                  setIsPreviewMode(true);
                }}
                className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 flex items-center justify-center space-x-1.5"
              >
                <Eye className="w-4 h-4" />
                <span>Preview</span>
              </button>

              <button
                type="button"
                id="btn-publish-post"
                onClick={handlePublish}
                disabled={isSubmitting || !selectedFile}
                className="flex-1 py-3 rounded-xl bg-white text-black text-xs font-semibold hover:bg-zinc-200 flex items-center justify-center space-x-1.5 disabled:opacity-40 active:scale-[0.99] transition-all"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <span>Publish</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
