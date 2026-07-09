// ============================================================
// Auth
// ============================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  initialCurrency: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

// ============================================================
// User
// ============================================================

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION";
  isEmailVerified: boolean;
  isTwoFactorEnabled: boolean;
  createdAt: string;
}

// ============================================================
// Wallet
// ============================================================

export interface Wallet {
  id: number;
  walletNumber: string;
  currencyCode: string;
  balance: number;
  availableBalance: number;
  status: "ACTIVE" | "INACTIVE" | "FROZEN" | "CLOSED";
  isDefault: boolean;
  createdAt: string;
}

export interface CreateWalletRequest {
  currencyCode: string;
  setAsDefault?: boolean;
}

export interface DepositRequest {
  walletNumber: string;
  amount: number;
  description?: string;
}

// ============================================================
// Transaction
// ============================================================

export type TransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER"
  | "PAYMENT"
  | "REFUND"
  | "FEE";

export type TransactionStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REVERSED";

export interface Transaction {
  id: number;
  referenceNumber: string;
  sourceWalletNumber?: string;
  destinationWalletNumber?: string;
  amount: number;
  fee: number;
  exchangeRate: number;
  sourceCurrencyCode: string;
  destinationCurrencyCode: string;
  type: TransactionType;
  status: TransactionStatus;
  description?: string;
  completedAt?: string;
  createdAt: string;
}

export interface TransferRequest {
  sourceWalletNumber: string;
  destinationWalletNumber: string;
  amount: number;
  description?: string;
}

export interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  page?: number;
  size?: number;
}

// ============================================================
// API
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  errors?: Record<string, string>;
  timestamp: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
}
