import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Clay -> lead pool intake.
// Add an "HTTP API" column in your Clay table pointing POST at this URL with
// header  x-clay-secret: <CLAY_WEBHOOK_SECRET>  and a JSON body of the row.
// Accepts one object or an array of objects. Duplicates (phone digits, else
// email) are skipped. Every row lands unclaimed in the "Clay" segment.

const digits = (p: unknown) => (p ? String(p).replace(/\D/g, "") : "");
const s = z.string().trim().max(300).optional().nullable();

const RowSchema = z
  .object({
    first_name: s,
    last_name: s,
    full_name: s,
    company: s,
    website: s,
    email: s,
    email_status: s,
    phone: s,
    linkedin_url: s,
    title: s,
    city: s,
    state: s,
    industry: s,
    company_size: s,
    lead_type: s,
    notes: z.string().trim().max(4000).optional().nullable(),
  })
  .passthrough();

const BodySchema = z.union([RowSchema, z.array(RowSchema).max(500)]);

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function normalizeUrl(v: string | null | undefined) {
  const t = (v ?? "").trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

export const Route = createFileRoute("/api/public/hooks/clay-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CLAY_WEBHOOK_SECRET"];
        const provided =
          request.headers.get("x-clay-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          new URL(request.url).searchParams.get("secret") ||
          "";
        if (!expected || !timingSafeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
        }

        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Existing keys for dedupe.
        const { data: existing } = await supabaseAdmin
          .from("b2b_lead_pool")
          .select("phone, email");
        const seenPhones = new Set<string>();
        const seenEmails = new Set<string>();
        for (const r of existing ?? []) {
          const d = digits((r as { phone?: string }).phone);
          if (d) seenPhones.add(d);
          const e = ((r as { email?: string }).email ?? "").trim().toLowerCase();
          if (e) seenEmails.add(e);
        }

        const payload: Record<string, unknown>[] = [];
        let skipped = 0;

        for (const r of rows) {
          let first = (r.first_name ?? "").trim();
          let last = (r.last_name ?? "").trim();
          if (!first && !last && r.full_name) {
            const parts = r.full_name.trim().split(/\s+/);
            first = parts.shift() ?? "";
            last = parts.join(" ");
          }
          const email = (r.email ?? "").trim().toLowerCase();
          const phoneD = digits(r.phone);

          if (!first && !last && !r.company && !email && !phoneD) {
            skipped++;
            continue;
          }
          if (phoneD ? seenPhones.has(phoneD) : email ? seenEmails.has(email) : false) {
            skipped++;
            continue;
          }
          if (phoneD) seenPhones.add(phoneD);
          if (email) seenEmails.add(email);

          payload.push({
            first_name: first || null,
            last_name: last || null,
            company: (r.company ?? "")?.trim() || null,
            website: normalizeUrl(r.website),
            email: email || null,
            email_status: (r.email_status ?? "")?.trim() || null,
            phone: (r.phone ?? "")?.trim() || null,
            linkedin_url: normalizeUrl(r.linkedin_url),
            title: (r.title ?? "")?.trim() || null,
            city: (r.city ?? "")?.trim() || null,
            state: (r.state ?? "")?.trim() || null,
            industry: (r.industry ?? "")?.trim() || null,
            company_size: (r.company_size ?? "")?.trim() || null,
            lead_type: (r.lead_type ?? "")?.trim() || null,
            notes: (r.notes ?? "")?.trim() || null,
            segment: "Clay",
            source: "clay",
            status: "unclaimed",
          });
        }

        let inserted = 0;
        for (const row of payload) {
          const { error } = await supabaseAdmin.from("b2b_lead_pool").insert(row);
          if (error) skipped++;
          else inserted++;
        }

        return Response.json({ ok: true, received: rows.length, inserted, skipped });
      },
    },
  },
});
