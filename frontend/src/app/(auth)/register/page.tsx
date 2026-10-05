"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { describeError } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/types";
import {
  validateCountry,
  validateDateOfBirth,
  validateDocumentNumber,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  validatePin,
} from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, SelectField } from "@/components/ui/Field";
import { PinField } from "@/components/ui/PinField";

type Errors = Record<string, string | null | undefined>;

const DOCUMENT_OPTIONS = DOCUMENT_TYPES.map((value) => ({
  value,
  label: value === "NATIONAL_ID" ? "National ID" : "Passport",
}));

/**
 * Onboarding and KYC in one step, exactly as the contract defines it: the register
 * call creates the customer, the wallets and the KYC submission together.
 */
export default function RegisterPage() {
  useDocumentTitle("Create account");
  const { status, beginRegistration } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    fullName: "",
    password: "",
    pin: "",
    phone: "",
    dateOfBirth: "",
    country: "",
    documentType: "",
    documentNumber: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): Errors => ({
    email: validateEmail(form.email),
    fullName: validateFullName(form.fullName),
    password: validatePassword(form.password),
    pin: validatePin(form.pin, "PIN"),
    phone: validatePhone(form.phone),
    dateOfBirth: validateDateOfBirth(form.dateOfBirth),
    country: validateCountry(form.country),
    documentType: form.documentType ? null : "Select the document you are submitting.",
    documentNumber: validateDocumentNumber(form.documentNumber),
  });

  const submit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setFailure(null);
    try {
      await beginRegistration({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        password: form.password,
        pin: form.pin,
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth,
        country: form.country.trim().toUpperCase(),
        documentType: form.documentType as DocumentType,
        documentNumber: form.documentNumber.trim().toUpperCase(),
      });
      router.replace("/");
    } catch (err) {
      setFailure(describeError(err, "Registration"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h2 font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-body leading-6 text-ink-muted">
          Identity documents are collected up front so your wallets can be verified and your limits
          raised. A tier-0 account starts pending verification.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        <fieldset className="space-y-5" disabled={submitting}>
          <legend className="label mb-3">You</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                inputMode="email"
                error={errors.email}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Full name"
                value={form.fullName}
                onChange={set("fullName")}
                autoComplete="name"
                error={errors.fullName}
                hint="Exactly as printed on your ID document."
                required
              />
            </div>
            <Field
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+251900000000"
              error={errors.phone}
              required
            />
            <Field
              label="Date of birth"
              type="date"
              value={form.dateOfBirth}
              onChange={set("dateOfBirth")}
              autoComplete="bday"
              error={errors.dateOfBirth}
              hint="You must be 18 or over."
              required
            />
            <Field
              label="Country"
              value={form.country}
              onChange={set("country")}
              autoComplete="country-code"
              maxLength={2}
              transform={(value) => value.toUpperCase()}
              placeholder="ET"
              error={errors.country}
              hint="2-letter ISO code."
              required
            />
          </div>
        </fieldset>

        <fieldset className="space-y-5 border-t border-line pt-6" disabled={submitting}>
          <legend className="label mb-3">Credentials</legend>
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            error={errors.password}
            hint="At least 8 characters."
            required
          />
          <PinField
            label="4-digit PIN"
            value={form.pin}
            onChange={set("pin")}
            error={errors.pin}
            hint="Authorises every movement of money. Never share it."
            autoComplete="off"
          />
        </fieldset>

        <fieldset className="space-y-5 border-t border-line pt-6" disabled={submitting}>
          <legend className="label mb-3">Verification document</legend>
          <SelectField
            label="Document type"
            value={form.documentType}
            options={DOCUMENT_OPTIONS}
            onChange={(value) => set("documentType")(value)}
            placeholder="Select a document"
            error={errors.documentType}
            required
          />
          <Field
            label="Document number"
            value={form.documentNumber}
            onChange={(value) => set("documentNumber")(value.toUpperCase())}
            autoComplete="off"
            maxLength={20}
            error={errors.documentNumber}
            hint="We store only the last 4 digits for display."
            required
          />
        </fieldset>

        {failure ? <Callout tone="error">{failure}</Callout> : null}

        <div className="space-y-3">
          <Button type="submit" block size="lg" loading={submitting} disabled={submitting}>
            Create account
          </Button>
          <p className="text-center text-label leading-5 text-ink-faint">
            By continuing you confirm the details and document are yours.{" "}
            <Link href="/login" className="font-medium text-accent underline underline-offset-4">
              Already registered? Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
