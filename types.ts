export interface UserSettings {
  minTrustScoreToDm: number; // Minimum score required to bypass request folder
  requiresCollateral: boolean; // If true, low trust users must lock tokens
  collateralAmount: number; // Amount of tokens to lock
  allowList: string[]; // IDs allowed regardless of score
  blockList: string[]; // IDs blocked regardless of score
}

export interface User {
  id: string;
  walletAddress: string;
  name: string;
  avatar: string;
  bio: string;
  trustScore: number; // 0-100 (Derived from Intuition Mainnet)
  reputationAtoms: string[];
  communities: string[];
  settings?: UserSettings; // Local settings for privacy
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string; // Encrypted string
  timestamp: number;
  read: boolean;
  type: 'text' | 'image' | 'system';
}

export type ConversationStatus = 'active' | 'request_pending' | 'rejected' | 'blocked';

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  unreadCount: number;
  isGroup: boolean;
  status: ConversationStatus; // Replaces simple boolean isRequest
  collateralLocked?: number; // Amount of tokens locked by sender
}

export interface TrustSettings {
  minTrustScore: number;
  maxGraphDistance: number;
  collateralRequired: number;
}
