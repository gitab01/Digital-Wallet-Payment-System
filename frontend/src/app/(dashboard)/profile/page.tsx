"use client";

import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  UserCircle, Mail, Phone, ShieldCheck,
  Calendar, Crown, BadgeCheck, Lock, KeyRound,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function ProfilePage() {
  const { user: cached } = useAuthStore();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", "me"],
    queryFn: async () => (await userApi.getMe()).data.data,
    initialData: cached ?? undefined,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-56 rounded-2xl" />
      </div>
    );
  }

  if (!user) return null;

  const initials = `${user.firstName[0]}${user.lastName[0]}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your account information</p>
      </div>

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-900 via-surface-800 to-surface-900 p-6 shadow-card-lg">
        {/* Decoration */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-6 left-8 h-32 w-32 rounded-full bg-purple-500/10 blur-2xl" />

        <div className="relative flex items-center gap-5">
          {/* Avatar */}
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-brand text-2xl font-extrabold text-white shadow-glow">
            {initials}
            {user.isEmailVerified && (
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-surface-900">
                <BadgeCheck className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </span>
            )}
          </div>

          {/* Info */}
          <div>
            <h2 className="text-xl font-bold text-white">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-sm text-white/50">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`badge ${user.status === "ACTIVE" ? "badge-success" : "badge-error"}`}>
                {user.status}
              </span>
              {user.role === "ADMIN" && (
                <span className="badge badge-warning">
                  <Crown className="h-3 w-3" /> Admin
                </span>
              )}
              {user.isEmailVerified && (
                <span className="badge badge-info">
                  <BadgeCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Account details ── */}
      <div className="card space-y-1">
        <h3 className="mb-4 font-semibold text-surface-800">Account Details</h3>

        {[
          { icon: UserCircle, label: "Full name",    value: `${user.firstName} ${user.lastName}` },
          { icon: Mail,       label: "Email",         value: user.email },
          { icon: Phone,      label: "Phone",         value: user.phoneNumber ?? "Not provided" },
          { icon: ShieldCheck,label: "Role",          value: user.role },
          { icon: Calendar,   label: "Member since",  value: formatDate(user.createdAt) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-surface-50 transition-colors">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-100">
              <Icon className="h-4 w-4 text-surface-500" />
            </div>
            <dt className="w-32 shrink-0 text-sm text-surface-400">{label}</dt>
            <dd className="text-sm font-medium text-surface-800 truncate">{value}</dd>
          </div>
        ))}
      </div>

      {/* ── Security ── */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-surface-800">Security</h3>

        <div className="flex items-center justify-between rounded-xl border border-surface-100 p-4 hover:bg-surface-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-100">
              <Lock className="h-4 w-4 text-surface-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-800">Password</p>
              <p className="text-xs text-surface-400">Last changed recently</p>
            </div>
          </div>
          <button className="btn-secondary py-1.5 px-3 text-xs">Update</button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-surface-100 p-4 hover:bg-surface-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-100">
              <KeyRound className="h-4 w-4 text-surface-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-800">Two-factor authentication</p>
              <p className="text-xs text-surface-400">Add an extra layer of protection</p>
            </div>
          </div>
          <span className={`badge ${user.isTwoFactorEnabled ? "badge-success" : "badge-neutral"}`}>
            {user.isTwoFactorEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
