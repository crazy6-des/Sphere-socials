import { SongMetadata } from '../../types';

export interface MusicProvider {
  name: string;
  isConfigured(): boolean;
  search(query: string): Promise<{ songs: SongMetadata[]; isConfigured: boolean; providerName: string }>;
}

/**
 * Real Apple / iTunes Open Search Catalog Provider
 * Uses legal, free public catalog search to fetch real song metadata without faking songs.
 */
export class ITunesMusicProvider implements MusicProvider {
  name = 'iTunes Public Catalog';

  isConfigured(): boolean {
    return true; // Publicly available open API
  }

  async search(query: string): Promise<{ songs: SongMetadata[]; isConfigured: boolean; providerName: string }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { songs: [], isConfigured: true, providerName: this.name };
    }

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&entity=song&limit=12`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return { songs: [], isConfigured: true, providerName: this.name };
      }

      const data: any = await response.json();
      const results: any[] = data.results || [];

      const songs: SongMetadata[] = results.map(item => ({
        title: item.trackName || item.collectionName || 'Unknown Title',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || undefined,
        artworkUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '250x250bb') : undefined,
        previewUrl: item.previewUrl || undefined,
        providerId: String(item.trackId || item.collectionId || ''),
      }));

      return {
        songs,
        isConfigured: true,
        providerName: this.name,
      };
    } catch (err) {
      console.error('[Music Provider] Search error:', err);
      return { songs: [], isConfigured: true, providerName: this.name };
    }
  }
}

/**
 * Custom Commercial Music Provider (Spotify / Deezer / Enterprise Audio API)
 */
export class CustomMusicProvider implements MusicProvider {
  name = 'Commercial Music API';

  constructor(private apiKey?: string, private apiUrl?: string) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string): Promise<{ songs: SongMetadata[]; isConfigured: boolean; providerName: string }> {
    if (!this.isConfigured()) {
      return { songs: [], isConfigured: false, providerName: this.name };
    }
    // Forward to custom enterprise provider endpoint
    return { songs: [], isConfigured: true, providerName: this.name };
  }
}

export function getMusicProvider(env?: any): MusicProvider {
  const e = env || (typeof process !== 'undefined' ? process.env : {});
  if (e.MUSIC_API_KEY) {
    return new CustomMusicProvider(e.MUSIC_API_KEY, e.MUSIC_API_URL);
  }
  // Default to genuine iTunes metadata provider so users have real song tagging
  return new ITunesMusicProvider();
}
