"use client";

import { useAuth } from "@/providers/AuthProvider";
import { useWallet } from "@/providers/WalletProvider";
import { formatClock } from "@/lib/money";
import { Dot } from "./ui/Chip";

/**
 * Small, always-visible statement of how current these numbers are. Users distrust
 * figures that move on their own, so the feed's health is on screen, not in a log.
 */
export function ConnectionBadge({ compact = false }: { compact?: boolean }) {
  const { socket, lastUpdated, polling } = useWallet();
  const { status } = useAuth();

  if (status !== "authenticated") return null;

  const tone = socket === "live" ? "positive" : socket === "offline" ? "negative" : "muted";
  const label =
    socket === "live"
      ? "Live"
      : socket === "connecting"
        ? "Connecting"
        : socket === "reconnecting"
          ? "Reconnecting"
          : socket === "offline"
            ? "No feed"
            : "Idle";

  const description =
    socket === "live"
      ? "Receiving committed balance updates over the socket"
      : polling
        ? "Socket unavailable — refreshing every 10 seconds instead"
        : "Waiting for the realtime socket";

  return (
    <span
      title={description}
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-medium uppercase tracking-wide text-ink-muted"
    >
      <Dot tone={tone} />
      {label}
      {!compact && lastUpdated ? (
        <span className="num font-normal normal-case tracking-normal text-ink-faint">
          · synced {formatClock(lastUpdated)}
        </span>
      ) : null}
    </span>
  );
}
