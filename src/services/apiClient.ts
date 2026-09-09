import { ApiResponse, AuthResponse, User, Post, Comment, UserPublicProfile, Wallet, Transaction, Withdrawal, RewardProviderStatus, SongMetadata, UserSettings, SystemStatus } from '../types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';
const TOKEN_STORAGE_KEY = 'sphere_auth_token';
const REFRESH_TOKEN_STORAGE_KEY = 'sphere_refresh_token';
const USER_STORAGE_KEY = 'sphere_user_data';
const FEED_CACHE_KEY = 'sphere_feed_cache';
const USER_POSTS_KEY = 'sphere_user_created_posts';

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private memoryCache: Map<string, { data: any; timestamp: number }> = new Map();

  constructor() {
    // Restore persistent session tokens
    try {
      this.token = localStorage.getItem(TOKEN_STORAGE_KEY);
      this.refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  setSession(token: string | null, refreshToken?: string | null, user?: User | null) {
    this.token = token;
    if (refreshToken !== undefined) {
      this.refreshToken = refreshToken;
    }
    try {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
      } else if (refreshToken === null) {
        localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      }
      if (user) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } else if (user === null) {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  setToken(token: string | null) {
    this.setSession(token);
  }

  getToken(): string | null {
    return this.token;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  getCachedUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setCachedUser(user: User | null) {
    try {
      if (user) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Cached feed accessor (falls back to empty array to ensure database is the source of truth)
   */
  getCachedFeed(): Post[] {
    return [];
  }

  /**
   * Invalidate any transient caches
   */
  saveCreatedPost(_post: Post) {
    this.memoryCache.clear();
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (!this.refreshToken || this.isRefreshing) return false;
    this.isRefreshing = true;
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      const data = await response.json();
      if (response.ok && data.success && data.data?.token) {
        this.setToken(data.data.token);
        return true;
      }
      // If refresh token invalid or revoked, clear session
      this.setSession(null, null);
      return false;
    } catch {
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
    }

    let response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // If 401 Unauthorized, attempt refresh if we have a refresh token
    if (response.status === 401 && this.refreshToken && !endpoint.includes('/api/auth/')) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed && this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers,
        });
      }
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new Error(`Invalid server response (${response.status})`);
    }

    if (!response.ok || json.success === false) {
      throw new Error(json.error || `Request failed with status ${response.status}`);
    }

    return json.data !== undefined ? json.data : json;
  }

  // Auth
  async register(data: { username: string; email: string; password: string; displayName?: string }): Promise<AuthResponse> {
    const res = await this.request<any>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.token, res.refreshToken, res.user);
    return res;
  }

  async login(data: { identifier: string; password: string }): Promise<AuthResponse> {
    const res = await this.request<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.token, res.refreshToken, res.user);
    return res;
  }

  async getMe(): Promise<{ user: any }> {
    const res = await this.request<{ user: any }>('/api/auth/me', { method: 'GET' });
    if (res?.user) {
      this.setCachedUser(res.user);
    }
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      this.setSession(null, null, null);
    }
  }

  async forgotPassword(email: string): Promise<{ message: string; data?: { resetToken?: string; emailSent?: boolean; emailError?: string } }> {
    return this.request<{ message: string; data?: { resetToken?: string; emailSent?: boolean; emailError?: string } }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(data: { token: string; newPassword: string }): Promise<{ message: string; data?: { token: string; refreshToken: string; user: User } }> {
    const res = await this.request<{ message: string; data?: { token: string; refreshToken: string; user: User } }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.data?.token) {
      this.setSession(res.data.token, res.data.refreshToken, res.data.user);
    }
    return res;
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Media
  async uploadImage(file: File): Promise<{ url: string; key: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<{ url: string; key: string }>('/api/upload', {
      method: 'POST',
      body: formData,
    });
  }

  // Feed & Posts (Optimized for TikTok-speed rendering, offline persistence & quota saving)
  async getPosts(page: number = 1, limit: number = 8, userId?: string, feedType: 'forYou' | 'following' = 'forYou'): Promise<{ posts: Post[]; page: number; hasMore: boolean }> {
    let url = `/api/posts?page=${page}&limit=${limit}&feed=${feedType}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;

    return await this.request<{ posts: Post[]; page: number; hasMore: boolean }>(url, { method: 'GET' });
  }

  async deletePost(postId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/posts/${postId}`, {
      method: 'DELETE',
    });
  }

  async createPost(data: { imageUrl: string; caption?: string; song?: SongMetadata | null }): Promise<{ post: Post }> {
    const res = await this.request<{ post: Post }>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res?.post) {
      this.saveCreatedPost(res.post);
    }
    return res;
  }

  async toggleLike(postId: string): Promise<{ hasLiked: boolean; likesCount: number }> {
    return await this.request<{ hasLiked: boolean; likesCount: number }>(`/api/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  async getComments(postId: string): Promise<{ comments: Comment[] }> {
    return this.request<{ comments: Comment[] }>(`/api/posts/${postId}/comments`, { method: 'GET' });
  }

  async addComment(postId: string, content: string): Promise<{ comment: Comment }> {
    return await this.request<{ comment: Comment }>(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async deleteComment(commentId: string): Promise<{ success: boolean; message: string; data?: { commentsCount: number } }> {
    return this.request<{ success: boolean; message: string; data?: { commentsCount: number } }>(`/api/comments/${commentId}`, {
      method: 'DELETE',
    });
  }

  // Profile & Social
  async getUserProfile(usernameOrTarget: string): Promise<{ profile: UserPublicProfile }> {
    const endpoint = usernameOrTarget === 'me' ? '/api/users/me' : `/api/users/${encodeURIComponent(usernameOrTarget)}`;
    return this.request<{ profile: UserPublicProfile }>(endpoint, { method: 'GET' });
  }

  async getMyProfile(): Promise<{ profile: UserPublicProfile }> {
    return this.request<{ profile: UserPublicProfile }>('/api/users/me', { method: 'GET' });
  }

  async updateProfile(data: { displayName?: string; bio?: string; avatarUrl?: string }): Promise<{ user: User }> {
    const res = await this.request<{ user: User }>('/api/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (res?.user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
    }
    return res;
  }

  async getUserSettings(): Promise<{ settings: UserSettings }> {
    return this.request<{ settings: UserSettings }>('/api/users/me/settings', { method: 'GET' });
  }

  async updateUserSettings(settings: Partial<UserSettings>): Promise<{ settings: UserSettings }> {
    return this.request<{ settings: UserSettings }>('/api/users/me/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async getSystemStatus(): Promise<{ success: boolean; data: SystemStatus }> {
    return this.request<{ success: boolean; data: SystemStatus }>('/api/system/status', { method: 'GET' });
  }

  async toggleFollow(userId: string): Promise<{ isFollowing: boolean }> {
    return this.request<{ isFollowing: boolean }>(`/api/users/${userId}/follow`, {
      method: 'POST',
    });
  }

  // Music Search
  async searchMusic(query: string): Promise<{ songs: SongMetadata[]; isConfigured: boolean; providerName: string }> {
    return this.request<{ songs: SongMetadata[]; isConfigured: boolean; providerName: string }>(
      `/api/music/search?q=${encodeURIComponent(query)}`,
      { method: 'GET' }
    );
  }

  // Wallet
  async getWallet(): Promise<{ wallet: Wallet; transactions: Transaction[] }> {
    return this.request<{ wallet: Wallet; transactions: Transaction[] }>('/api/wallet', { method: 'GET' });
  }

  async requestWithdrawal(data: { amount: number; payoutMethod: string; destinationAccount: string }): Promise<{ withdrawalId: string; newBalance: number }> {
    return this.request<{ withdrawalId: string; newBalance: number }>('/api/withdrawals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Earn
  async getEarnProviders(): Promise<{ providers: RewardProviderStatus[] }> {
    return this.request<{ providers: RewardProviderStatus[] }>('/api/earn/providers', { method: 'GET' });
  }

  async claimAttentionReward(): Promise<{ rewardAmount: number; newBalance: number; message: string }> {
    return this.request<{ rewardAmount: number; newBalance: number; message: string }>('/api/earn/attention-reward', {
      method: 'POST',
    });
  }

  async simulateEarnReward(providerId: string, amount: number): Promise<{ rewardAmount: number; newBalance: number; message: string }> {
    return this.request<{ rewardAmount: number; newBalance: number; message: string }>('/api/earn/simulate-reward', {
      method: 'POST',
      body: JSON.stringify({ providerId, amount }),
    });
  }
}

export const apiClient = new ApiClient();
