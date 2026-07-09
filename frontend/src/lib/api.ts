import apiClient from "./axios";
import type {
  ApiResponse,
  AuthResponse,
  CreateWalletRequest,
  DepositRequest,
  LoginRequest,
  PageResponse,
  RegisterRequest,
  Transaction,
  TransactionFilters,
  TransferRequest,
  User,
  Wallet,
} from "@/types";

// ============================================================
// Auth API
// ============================================================

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<ApiResponse<AuthResponse>>("/auth/register", data),

  login: (data: LoginRequest) =>
    apiClient.post<ApiResponse<AuthResponse>>("/auth/login", data),

  refresh: (refreshToken: string) =>
    apiClient.post<ApiResponse<AuthResponse>>(
      `/auth/refresh?refreshToken=${refreshToken}`
    ),

  logout: (refreshToken: string) =>
    apiClient.post<ApiResponse<void>>(`/auth/logout?refreshToken=${refreshToken}`),
};

// ============================================================
// User API
// ============================================================

export const userApi = {
  getMe: () => apiClient.get<ApiResponse<User>>("/users/me"),
};

// ============================================================
// Wallet API
// ============================================================

export const walletApi = {
  createWallet: (data: CreateWalletRequest) =>
    apiClient.post<ApiResponse<Wallet>>("/wallets", data),

  getWallets: () => apiClient.get<ApiResponse<Wallet[]>>("/wallets"),

  getWallet: (walletNumber: string) =>
    apiClient.get<ApiResponse<Wallet>>(`/wallets/${walletNumber}`),

  deposit: (data: DepositRequest) =>
    apiClient.post<ApiResponse<Wallet>>("/wallets/deposit", data),
};

// ============================================================
// Transaction API
// ============================================================

export const transactionApi = {
  transfer: (data: TransferRequest) =>
    apiClient.post<ApiResponse<Transaction>>("/transactions/transfer", data),

  getHistory: (filters: TransactionFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, String(value));
      }
    });
    return apiClient.get<ApiResponse<PageResponse<Transaction>>>(
      `/transactions?${params.toString()}`
    );
  },

  getTransaction: (referenceNumber: string) =>
    apiClient.get<ApiResponse<Transaction>>(`/transactions/${referenceNumber}`),
};
