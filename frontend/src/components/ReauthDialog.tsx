"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Session expiry is silent for reading, never for moving. If a token expires while
 * a transfer is queued, this dialog blocks: the request is not replayed until the
 * user proves they are still them, and it is never replayed at all if they refuse.
 */
export function ReauthDialog() {
  const { reauthRequest, reauthError, submitReauth, cancelReauth, email } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (reauthRequest) setPassword("");
  }, [reauthRequest]);

  if (!reauthRequest) return null;

  const onSubmit = async () => {
    if (!password) return;
    setBusy(true);
    await submitReauth(password);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={cancelReauth}
      dismissable={false}
      title="Confirm it's you"
      description={email ?? undefined}
    >
      <div className="space-y-4">
        <p className="text-body leading-6 text-ink-muted">{reauthRequest.reason}</p>
        <p className="flex items-start gap-2 text-label leading-5 text-ink-faint">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          Nothing has left your account yet. Cancelling leaves your balance exactly as it is
          now.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          className="space-y-4"
        >
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            error={reauthError}
            required
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" block loading={busy} disabled={!password}>
              Verify and continue
            </Button>
            <Button variant="secondary" block onClick={cancelReauth} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
