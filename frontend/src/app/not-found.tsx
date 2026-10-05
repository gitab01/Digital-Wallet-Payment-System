import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-16">
      <p className="label">Digital Wallet</p>
      <h1 className="text-h2 font-semibold tracking-tight">This page does not exist</h1>
      <p className="text-body leading-6 text-ink-muted">
        Nothing was moved, nothing was changed. Check the address, or go back to your wallets.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 w-fit items-center rounded-md border border-ink bg-ink px-4 text-label font-medium uppercase tracking-wide text-white hover:bg-white hover:text-ink"
      >
        Back to wallet
      </Link>
    </main>
  );
}
