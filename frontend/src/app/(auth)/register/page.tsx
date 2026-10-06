"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { uploadKycDocument } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  requiredSidesFor,
  type DocumentSide,
  type DocumentType,
} from "@/lib/types";
import {
  validateCountry,
  validateDateOfBirth,
  validateDocumentNumber,
  validateEmail,
  validateFullName,
  validateImageFile,
  validatePassword,
  validatePhone,
  validatePin,
} from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { DocumentPhotoField } from "@/components/DocumentPhotoField";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PinField } from "@/components/ui/PinField";

type Errors = Record<string, string | null | undefined>;
type Files = Partial<Record<DocumentSide, File | null>>;

const DOCUMENT_OPTIONS = DOCUMENT_TYPES.map((value) => ({
  value,
  label: documentTypeLabel(value),
}));

const SIDE_LABEL: Record<DocumentSide, string> = {
  FRONT: "Front",
  BACK: "Back",
};

const STEPS = ["Your details", "Credentials", "Document photos"] as const;

/**
 * Onboarding and KYC in one flow, exactly as the contract defines it: the register
 * call creates the customer, the wallets and the KYC submission together, then each
 * required side of the document is posted to `POST /api/kyc/documents`.
 *
 * It is three steps rather than one long page: on a 390px phone the document tiles
 * need room of their own, and a camera step squeezed under a password field is how
 * people end up signing up with no images at all.
 */
export default function RegisterPage() {
  useDocumentTitle("Create account");
  const { status, beginRegistration } = useAuth();
  const { push } = useToast();
  const router = useRouter();

  const [step, setStep] = useState(0);
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
  const [files, setFiles] = useState<Files>({});
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Once this page has created the session it owns navigation: an upload still
     has to run before the wallet is worth showing. */
  const ownsNavigation = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !ownsNavigation.current) router.replace("/");
  }, [status, router]);

  const documentType = form.documentType as DocumentType | "";
  const sides = documentType ? requiredSidesFor(documentType) : [];

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const pickDocumentType = (value: string) => {
    const nextSides = value ? requiredSidesFor(value) : [];
    setForm((prev) => ({ ...prev, documentType: value }));
    /* A photo taken for a licence is not a photo of a passport information page,
       so any side the new type does not ask for is dropped rather than uploaded. */
    setFiles((prev) => {
      const kept: Files = {};
      for (const side of nextSides) kept[side] = prev[side] ?? null;
      return kept;
    });
  };

  const personalErrors = (): Errors => ({
    email: validateEmail(form.email),
    fullName: validateFullName(form.fullName),
    phone: validatePhone(form.phone),
    dateOfBirth: validateDateOfBirth(form.dateOfBirth),
    country: validateCountry(form.country),
  });

  const credentialErrors = (): Errors => ({
    password: validatePassword(form.password),
    pin: validatePin(form.pin, "PIN"),
  });

  const documentErrors = (): Errors => {
    const next: Errors = {
      documentType: form.documentType ? null : "Select the document you are submitting.",
      documentNumber: validateDocumentNumber(form.documentNumber),
    };
    for (const side of requiredSidesFor(form.documentType)) {
      next[`side-${side}`] = validateImageFile(files[side], `${SIDE_LABEL[side]} of your document`);
    }
    return next;
  };

  const keepOnly = (next: Errors) => {
    setErrors((prev) => ({ ...prev, ...next }));
    return Object.values(next).some(Boolean);
  };

  const goForward = () => {
    if (step === 0) {
      const found = keepOnly(personalErrors());
      if (found) return;
      setStep(1);
      return;
    }
    if (step === 1) {
      const found = keepOnly(credentialErrors());
      if (found) return;
      setStep(2);
      return;
    }
    void submit();
  };

  const submit = async () => {
    if (keepOnly(documentErrors())) return;

    setSubmitting(true);
    setFailure(null);
    ownsNavigation.current = true;

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
    } catch (err) {
      ownsNavigation.current = false;
      setFailure(describeError(err, "Registration"));
      setSubmitting(false);
      setProgress(null);
      return;
    }

    /* The account exists from here on. A failed image never invalidates the
       session — it is fixed on /verify, which is also the recovery path. */
    const failed: string[] = [];
    for (const [index, side] of sides.entries()) {
      const file = files[side];
      if (!file) continue;
      setProgress(
        sides.length > 1
          ? `Uploading the ${SIDE_LABEL[side].toLowerCase()} of your document (${index + 1} of ${sides.length})…`
          : "Uploading your document…",
      );
      try {
        await uploadKycDocument(side, file);
      } catch (err) {
        failed.push(`${SIDE_LABEL[side]}: ${describeError(err, "Upload")}`);
      }
    }

    setSubmitting(false);
    setProgress(null);

    if (failed.length > 0) {
      push({
        tone: "error",
        title: "Account created, document incomplete",
        body: "Add the missing images on the next screen — your submission stays under review until they arrive.",
      });
      router.replace("/verify?reason=upload");
      return;
    }
    router.replace("/");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-body leading-6 text-ink-muted">
          Identity documents are collected up front so your wallets can be verified and your limits
          raised. A tier-0 account starts pending verification.
        </p>
      </div>

      <Steps current={step} />

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          goForward();
        }}
        noValidate
      >
        {step === 0 ? (
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
        ) : null}

        {step === 1 ? (
          <fieldset className="space-y-5" disabled={submitting}>
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
        ) : null}

        {step === 2 ? (
          <fieldset className="space-y-5" disabled={submitting}>
            <legend className="label mb-3">Verification document</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Document type"
                value={form.documentType}
                options={DOCUMENT_OPTIONS}
                onChange={pickDocumentType}
                placeholder="Select a document"
                error={errors.documentType}
                hint={
                  form.documentType
                    ? `${documentTypeLabel(form.documentType)} is verified from ${
                        sides.length === 1 ? "its front page" : "both sides"
                      }.`
                    : undefined
                }
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
            </div>

            {sides.length > 0 ? (
              <>
                <p className="text-label leading-5 text-ink-muted">
                  Photograph the document itself, all four corners inside the frame, in good light and
                  with nothing covering the printed details. JPEG or PNG, up to 8 MB per side. The
                  image is re-encoded before it is stored, which removes the camera&rsquo;s location
                  data.
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  {sides.map((side) => (
                    <DocumentPhotoField
                      key={side}
                      label={`${SIDE_LABEL[side]} of your ${documentTypeLabel(form.documentType)}`}
                      file={files[side] ?? null}
                      error={errors[`side-${side}`]}
                      disabled={submitting}
                      onPick={(file) => {
                        setErrors((prev) => ({ ...prev, [`side-${side}`]: null }));
                        setFiles((prev) => ({ ...prev, [side]: file }));
                      }}
                      onClear={() => setFiles((prev) => ({ ...prev, [side]: null }))}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {progress ? <Callout tone="pending">{progress}</Callout> : null}
        {failure ? <Callout tone="error">{failure}</Callout> : null}

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            {step > 0 ? (
              <Button
                variant="secondary"
                block
                disabled={submitting}
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
                Back
              </Button>
            ) : null}
            <Button type="submit" block size="lg" loading={submitting} disabled={submitting || Boolean(progress)}>
              {step < 2 ? "Continue" : "Create account"}
            </Button>
          </div>
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

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Registration progress">
      {STEPS.map((label, index) => (
        <li key={label}>
          <span
            aria-current={index === current ? "step" : undefined}
            className={`chip ${
              index === current
                ? "border-ink text-ink"
                : index < current
                  ? "border-line text-accent"
                  : "border-line text-ink-faint"
            }`}
          >
            <span className="num">{index + 1}</span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
