"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClaimCaseButtonProps {
  caseId: string;
}

type ClaimState = "idle" | "pending" | "error";

/**
 * Only ever calls POST /api/staff/cases/[id]/claim — no Prisma, no env
 * vars, no claim logic of its own. Never shows "Claimed" until the server
 * actually confirms the atomic claim; on any outcome it calls
 * router.refresh() so the page re-renders from real database state rather
 * than a client-held belief about who owns the case.
 */
export function ClaimCaseButton({ caseId }: ClaimCaseButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<ClaimState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClaim() {
    if (state === "pending") return;
    setState("pending");
    setMessage(null);

    try {
      const response = await fetch(`/api/staff/cases/${caseId}/claim`, { method: "POST" });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        setState("error");
        setMessage("No staff identity is configured for this development environment.");
        return;
      }

      if (response.status === 404) {
        setState("error");
        setMessage("This case could not be found. It may have been removed.");
        return;
      }

      if (response.status === 409) {
        setState("error");
        setMessage("This case was already claimed by another staff member.");
        router.refresh();
        return;
      }

      if (!response.ok) {
        setState("error");
        setMessage("Something went wrong claiming this case. Please try again.");
        return;
      }

      // 200: either a fresh claim or an idempotent same-staff re-claim.
      void body;
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
      setMessage("Could not reach the server. Please check your connection and try again.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClaim}
        disabled={state === "pending"}
        aria-busy={state === "pending"}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {state === "pending" ? "Claiming…" : "Claim case"}
      </button>
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
