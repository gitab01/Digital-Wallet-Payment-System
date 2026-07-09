"use client";

import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { User, Mail, Phone, Shield, Calendar } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function ProfilePage() {
  const { user: cachedUser } = useAuthStore();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", "me"],
    queryFn: async () => {
      const { data } = await userApi.getMe();
      return data.data;
    },
    initialData: cachedUser ?? undefined,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!user) return null;

  const fields = [
    { icon: User, label: "Full name", value: `${user.firstName} ${user.lastName}` },
    { icon: Mail, label: "Email address", value: user.email },
    { icon: Phone, label: "Phone number", value: user.phoneNumber ?? "Not provided" },
    { icon: Shield, label: "Role", value: user.role },
    { icon: Calendar, label: "Member since", value: formatDate(user.createdAt) },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Your account information</p>
      </div>

      {/* Avatar + status */}
      <div className="card flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700">
          {user.firstName[0]}{user.lastName[0]}
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {user.firstName} {user.lastName}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user.status === "ACTIVE"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {user.status}
            </span>
            {user.isEmailVerified && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                Email verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info fields */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-800">Account Details</h3>
        <dl className="divide-y divide-gray-100">
          {fields.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-gray-400" />
              <dt className="w-36 shrink-0 text-sm text-gray-500">{label}</dt>
              <dd className="text-sm font-medium text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Security */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-800">Security</h3>
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Two-factor authentication</p>
            <p className="text-xs text-gray-500">Add an extra layer of security</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              user.isTwoFactorEnabled
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {user.isTwoFactorEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
