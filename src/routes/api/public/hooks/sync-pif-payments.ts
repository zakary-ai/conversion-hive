import { createFileRoute } from "@tanstack/react-router";

// Cron-triggered: pull the latest payment posts from Slack #pif-dm.
export const Route = createFileRoute("/api/public/hooks/sync-pif-payments")({
  server: {
    handlers: {
      POST: async () => {
        const { syncPifPayments, recordSyncFailure } = await import("@/lib/pif-payments.server");
        try {
          const result = await syncPifPayments();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[pif-sync] failed", message);
          await recordSyncFailure(message).catch(() => {});
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
