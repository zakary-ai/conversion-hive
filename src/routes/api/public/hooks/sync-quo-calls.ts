import { createFileRoute } from "@tanstack/react-router";

// Pulls recent Quo call activity into `call_logs` for every setter number.
// Scheduled via pg_cron every 5 minutes.
export const Route = createFileRoute("/api/public/hooks/sync-quo-calls")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncQuoCalls } = await import("@/lib/quo-sync.server");
          const sinceIso = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
          const result = await syncQuoCalls({ sinceIso, maxConversationPages: 3, maxArtifacts: 40 });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("sync-quo-calls failed:", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
