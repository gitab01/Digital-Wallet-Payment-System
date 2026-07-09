"use client";

import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getErrorMessage } from "@/lib/utils";
import type { LoginRequest, RegisterRequest } from "@/types";
import toast from "react-hot-toast";

/**
 * Provides authentication actions (login, register, logout) with
 * automatic store updates and navigation.
 */
export function useAuth() {
  const router = useRouter();
  const { setUser, setTokens, clearAuth, isAuthenticated, user } = useAuthStore();

  const login = async (credentials: LoginRequest) => {
    try {
      const { data } = await authApi.login(credentials);
      const { user, accessToken, refreshToken } = data.data;
      setTokens(accessToken, refreshToken);
      setUser(user);
      toast.success(`Welcome back, ${user.firstName}!`);
      router.push("/dashboard");
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const register = async (payload: RegisterRequest) => {
    try {
      const { data } = await authApi.register(payload);
      const { user, accessToken, refreshToken } = data.data;
      setTokens(accessToken, refreshToken);
      setUser(user);
      toast.success("Account created successfully!");
      router.push("/dashboard");
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("refreshToken="))
        ?.split("=")[1];

      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Silently ignore logout errors — we still clear local state
    } finally {
      clearAuth();
      router.push("/login");
    }
  };

  return { login, register, logout, isAuthenticated, user };
}
