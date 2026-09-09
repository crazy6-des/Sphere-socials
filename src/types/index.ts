export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: number;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  totalLikesReceived: number;
  isFollowing?: boolean;
}

export interface SongMetadata {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
  providerId?: string;
}

export interface Post {
  id: string;
  userId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  imageUrl: string;
  caption?: string;
  song?: SongMetadata | null;
  likesCount: number;
  commentsCount: number;
  hasLiked?: boolean;
  isFollowingAuthor?: boolean;
  createdAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  author: {
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  content: string;
  createdAt: number;
}

export interface Wallet {
  userId: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  updatedAt: number;
}

export type TransactionType = 'reward' | 'withdrawal' | 'engagement' | 'referral';
export type TransactionStatus = 'completed' | 'pending' | 'cancelled';

export interface Transaction {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  provider?: string;
  description: string;
  referenceId?: string;
  createdAt: number;
}

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  payoutMethod: 'paypal' | 'crypto_usdt' | 'bank';
  destinationAccount: string;
  status: 'pending' | 'processed' | 'rejected';
  createdAt: number;
}

export interface RewardProviderStatus {
  id: 'adgem' | 'offerwall' | 'esrnb';
  name: string;
  tagline: string;
  description: string;
  isConfigured: boolean;
  configurationNotes: string;
  supportedOfferTypes: string[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UserSettings {
  autoplayAudio: boolean;
  privateProfile: boolean;
  notificationsEnabled: boolean;
  dataSaver: boolean;
  theme?: 'dark' | 'light';
  accentColor?: 'indigo' | 'emerald' | 'amber' | 'slate' | 'rose';
  updatedAt?: number;
}

export interface SystemStatus {
  database: string;
  persistent: boolean;
  healthy: boolean;
  tables: string[];
  brevoConfigured: boolean;
  walletActive: boolean;
  timestamp: number;
}

