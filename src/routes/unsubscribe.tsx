import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({ meta: [{ title: "Unsubscribe" }] }),
  component: UnsubscribePage,
});

type State = "loading" | "valid" | "already" | "invalid" | "done" | "error";

function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.valid) setState("valid");
        else if (j.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setState("loading");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) setState("done");
      else if (j.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch { setState("error"); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center bg-card border border-border rounded-2xl p-8">
        <h1 className="text-2xl font-semibold">Email preferences</h1>
        {state === "loading" && <p className="mt-4 text-muted-foreground">Loading…</p>}
        {state === "valid" && (
          <>
            <p className="mt-4 text-muted-foreground">Click below to unsubscribe from these emails.</p>
            <button onClick={confirm} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              Confirm unsubscribe
            </button>
          </>
        )}
        {state === "done" && <p className="mt-4 text-muted-foreground">You've been unsubscribed.</p>}
        {state === "already" && <p className="mt-4 text-muted-foreground">You're already unsubscribed.</p>}
        {state === "invalid" && <p className="mt-4 text-muted-foreground">This unsubscribe link is invalid or expired.</p>}
        {state === "error" && <p className="mt-4 text-destructive">Something went wrong. Please try again.</p>}
      </div>
    </div>
  );
}
