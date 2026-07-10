"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Zap, Mail, Lock,
  ArrowRight, ShieldCheck, Globe, TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const schema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

const FEATURES = [
  { icon: ShieldCheck, title: "Bank-level security",    desc: "256-bit encryption & 2FA" },
  { icon: Globe,       title: "Multi-currency",         desc: "USD, EUR, GBP, and more" },
  { icon: TrendingUp,  title: "Instant transfers",      desc: "Real-time P2P payments" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [show, setShow] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-surface-900 p-12 lg:flex">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-brand opacity-[.08]" />
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" />

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold text-white">PayVault</span>
        </div>

        {/* Headline */}
        <div className="relative space-y-6">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight text-white">
              Your money,<br />
              <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
                always in control.
              </span>
            </h1>
            <p className="mt-4 text-base text-white/50">
              Manage digital wallets, send money globally, and track every transaction — all in one secure platform.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[.07] border border-white/[.08]">
                  <Icon className="h-5 w-5 text-brand-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-white/40">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-white/25">
          © {new Date().getFullYear()} PayVault. Enterprise-grade digital banking.
        </p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 items-center justify-center bg-surface-50 px-6 py-12">
        <div className="w-full max-w-md animate-slide-up">

          {/* Mobile brand */}
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold text-surface-900">PayVault</span>
          </div>

          <div className="card shadow-card-lg">
            <h2 className="text-2xl font-bold text-surface-900">Welcome back</h2>
            <p className="mt-1 text-sm text-surface-400">Sign in to your account</p>

            <form onSubmit={handleSubmit(login)} className="mt-7 space-y-5" noValidate>
              {/* Email */}
              <div>
                <label htmlFor="email" className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={cn("input pl-10", errors.email && "input-error")}
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="error-msg">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={cn("input pl-10 pr-11", errors.password && "input-error")}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="error-msg">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-3 text-[15px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in…
                  </span>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-500 transition-colors">
                Create one free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
