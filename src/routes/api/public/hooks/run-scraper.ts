import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/run-scraper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { runScrapePhase } = await import("@/lib/scraper-pipeline.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
          const triggeredBy = (admins?.[0]?.user_id as string) || "00000000-0000-0000-0000-000000000000";
          // skipIfRanToday: cron is scheduled at both 13:00 and 14:00 UTC to
          // cover DST; second invocation no-ops cleanly.
          const result = await runScrapePhase({ triggeredBy, skipIfRanToday: true });
          return Response.json({ ok: true, result });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
