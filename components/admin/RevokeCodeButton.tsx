"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Revokes a code. Two-step on purpose: revoking cuts a paying customer's
 * access immediately, so a stray tap shouldn't do it.
 */
export function RevokeCodeButton({ code }: { code: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function revoke() {
    setBusy(true);
    try {
      await fetch("/api/admin/codes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant hover:text-error transition-colors"
      >
        revogar
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={revoke}
        disabled={busy}
        className="font-label-md text-[10px] uppercase tracking-wider text-error disabled:opacity-50"
      >
        {busy ? "..." : "confirmar"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="font-label-md text-[10px] uppercase tracking-wider text-on-surface-variant"
      >
        não
      </button>
    </span>
  );
}
