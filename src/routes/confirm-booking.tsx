import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/confirm-booking")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirm your booking — Conversion Lab" },
      { name: "description", content: "Confirm your scheduled call with Conversion Lab." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmBookingPage,
});

type State =
  | { kind: "loading" }
  | { kind: "confirmed"; leadName: string | null; scheduledLabel: string; alreadyConfirmed: boolean }
  | { kind: "invalid" }
  | { kind: "error"; message: string };

function ConfirmBookingPage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setState({ kind: "invalid" });
        return;
      }
      try {
        const res = await fetch("/api/public/confirm-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          alreadyConfirmed?: boolean;
          leadName?: string | null;
          scheduledLabel?: string;
          reason?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          if (res.status === 404 || json.reason === "not_found" || json.reason === "invalid_token") {
            setState({ kind: "invalid" });
          } else {
            setState({ kind: "error", message: "Something went wrong. Please try again." });
          }
          return;
        }
        setState({
          kind: "confirmed",
          leadName: json.leadName ?? null,
          scheduledLabel: json.scheduledLabel ?? "",
          alreadyConfirmed: !!json.alreadyConfirmed,
        });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Network error. Please try again." });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {state.kind === "loading" && (
          <>
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-semibold">Confirming your booking…</h1>
            <p className="text-sm text-muted-foreground mt-2">One moment.</p>
          </>
        )}

        {state.kind === "confirmed" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h1 className="text-2xl font-semibold">
              {state.alreadyConfirmed ? "You're already confirmed" : "Thanks for confirming"}
              {state.leadName ? `, ${state.leadName}` : ""}!
            </h1>
            {state.scheduledLabel && (
              <p className="text-sm text-muted-foreground mt-3">
                We'll see you on <span className="text-foreground font-medium">{state.scheduledLabel}</span>.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-6">
              You can close this page.
            </p>
          </>
        )}

        {state.kind === "invalid" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold">Confirmation link invalid</h1>
            <p className="text-sm text-muted-foreground mt-3">
              This confirmation link isn't valid or has expired. If you think this is a mistake, reach out to your point of contact.
            </p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mt-3">{state.message}</p>
          </>
        )}
      </div>
    </main>
  );
}
