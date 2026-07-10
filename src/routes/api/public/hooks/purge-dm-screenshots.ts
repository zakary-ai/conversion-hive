import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/purge-dm-screenshots")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("dm_log_uploads")
          .select("id, image_path")
          .lt("created_at", cutoff)
          .limit(1000);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        if (!rows || rows.length === 0) {
          return new Response(JSON.stringify({ deleted: 0 }), { headers: { "Content-Type": "application/json" } });
        }

        const paths = rows.map((r) => r.image_path).filter((p) => p && !p.startsWith("inline-"));
        if (paths.length) {
          await supabaseAdmin.storage.from("dm-uploads").remove(paths);
        }
        await supabaseAdmin.from("dm_log_uploads").delete().in("id", rows.map((r) => r.id));

        return new Response(
          JSON.stringify({ deleted: rows.length, files_removed: paths.length }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
