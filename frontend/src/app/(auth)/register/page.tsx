"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, Zap, Mail, Lock, User, Phone,
  Coins, ArrowRight, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  { code: "USD", label: "🇺🇸 US Dollar" },
  { code: "EUR", label: "🇪🇺 Euro" },
  { code: "GBP", label: "🇬🇧 British Pound" },
  { code: "JPY", label: "🇯🇵 Japanese Yen" },
  { code: "MYR", label: "🇲🇾 Malaysian Ringgit" },
  { code: "SGD", label: "🇸🇬 Singapore Dollar" },
  { code: "AUD", label: "🇦🇺 Australian Dollar" },
  { code: "CAD", label: "🇨🇦 Canadian Dollar" },
];

const schema = z.object({
  firstName: z.string().min(2, "At least 2 characters"),
  lastName:  z.string().min(2, "At least 2 characters"),
  email:     z.string().email("Enter a valid email"),
  password:  z.string()
    .min(8, "At least 8 characters")
    .regex(/[0-9]/,          "Include a digit")
    .regex(/[a-z]/,          "Include a lowercase letter")
    .regex(/[A-Z]/,          "Include an uppercase letter")
    .regex(/[@#$%^&+=!]/,   "Include a special character"),
  phoneNumber:     z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone").optional().or(z.literal("")),
  initialCurrency: z.string().min(3).max(3),
});
type FormValues = z.infer<typeof schema>;

const PERKS = [
  "Zero setup fees",
  "Instant wallet creation",
  "Real-time notifications",
];

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const [show, setShow] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { initialCurrency: "USD" },
    });

  const onSubmit = async (d: FormValues) =>
    signUp({ ...d, phoneNumber: d.phoneNumber || undefined });

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel ── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-surface-900 p-12 lg:flex">
        <div className="absolute inset-0 bg-gradient-brand opacity-[.08]" />
        <div className="pointer-events-none absolute -left-20 top-10 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-purple-600/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold text-white">PayVault</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight text-white">
            Start your journey<br />
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
              in 60 seconds.
            </span>
          </h1>
          <p className="mt-4 text-base text-white/50">
            Create your free account and get access to a full-featured digital wallet instantly.
          </p>

          <ul className="mt-8 space-y-3">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" strokeWidth={2} />
                <span className="text-sm text-white/70">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/25">
          © {new Date().getFullYear()} PayVault. Enterprise-grade digital banking.
        </p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto bg-surface-50 px-6 py-10">
        <div className="w-full max-w-md animate-slide-up">

          {/* Mobile brand */}
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold">PayVault</span>
          </div>

          <div className="card shadow-card-lg">
            <h2 className="text-2xl font-bold text-surface-900">Create account</h2>
            <p className="mt-1 text-sm text-surface-400">Free forever. No credit card needed.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                {(["firstName", "lastName"] as const).map((f, i) => (
                  <div key={f}>
                    <label htmlFor={f} className="label">{i === 0 ? "First name" : "Last name"}</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                      <input
                        id={f}
                        type="text"
                        placeholder={i === 0 ? "John" : "Doe"}
                        className={cn("input pl-10", errors[f] && "input-error")}
                        {...register(f)}
                      />
                    </div>
                    {errors[f] && <p className="error-msg">{errors[f]?.message}</p>}
                  </div>
                ))}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    id="email" type="email" placeholder="you@example.com"
                    className={cn("input pl-10", errors.email && "input-error")}
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="error-msg">{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    id="password"
                    type={show ? "text" : "password"}
                    placeholder="Min 8 chars, upper, digit & symbol"
                    className={cn("input pl-10 pr-11", errors.password && "input-error")}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                    aria-label={show ? "Hide" : "Show"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="error-msg">{errors.password.message}</p>}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="label">
                  Phone <span className="normal-case font-normal text-surface-400">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <input
                    id="phone" type="tel" placeholder="+1 555 000 0000"
                    className={cn("input pl-10", errors.phoneNumber && "input-error")}
                    {...register("phoneNumber")}
                  />
                </div>
                {errors.phoneNumber && <p className="error-msg">{errors.phoneNumber.message}</p>}
              </div>

              {/* Currency */}
              <div>
                <label htmlFor="currency" className="label">Default currency</label>
                <div className="relative">
                  <Coins className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
                  <select
                    id="currency"
                    className="input pl-10 appearance-none"
                    {...register("initialCurrency")}
                  >
                    {CURRENCIES.map(({ code, label }) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-[15px]">
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating account…
                  </span>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-500">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
