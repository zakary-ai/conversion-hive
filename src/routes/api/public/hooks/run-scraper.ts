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
          const { runScraperPipeline } = await import("@/lib/scraper-pipeline.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Pick any admin user id for the run log
          const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
          const triggeredBy = (admins?.[0]?.user_id as string) || "00000000-0000-0000-0000-000000000000";
          const result = await runScraperPipeline({ triggeredBy });
          return Response.json({ ok: true, result });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
