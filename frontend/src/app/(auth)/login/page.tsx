"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { describeError } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { validateEmail, validatePassword } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field } from "@/components/ui/Field";

export default function LoginPage() {
  useDocumentTitle("Sign in");
  const { status, beginLogin } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const submit = async () => {
    const nextErrors = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setSubmitting(true);
    setFailure(null);
    try {
      await beginLogin({ email: email.trim(), password });
      router.replace("/");
    } catch (err) {
      setFailure(describeError(err, "Signing in"));
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h2 font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-body leading-6 text-ink-muted">
          Access your wallets, transfers and statements.
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          inputMode="email"
          error={errors.email}
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
          required
        />

        {failure ? <Callout tone="error">{failure}</Callout> : null}

        <Button type="submit" block size="lg" loading={submitting} disabled={submitting}>
          Sign in
        </Button>
      </form>

      <p className="border-t border-line pt-6 text-body text-ink-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-accent underline underline-offset-4">
          Create an account
        </Link>{" "}
        — verification is part of signing up.
      </p>
    </div>
  );
}
