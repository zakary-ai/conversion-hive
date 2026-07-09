import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                  */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

function slugify(input: string) {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "setter";
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

function todayKey(tz = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const DEFAULT_DM_PASSWORD = "ConversionLab1095!";

/* -------------------------------------------------------------------------- */
/*  Admin: CRUD DM Setters / Managers                                          */
/* -------------------------------------------------------------------------- */

export const listDmSetters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("dm_setters")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createDmSetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    is_manager: z.boolean().default(false),
    manager_id: z.string().uuid().nullable().optional(),
    commission_rate: z.number().min(0).max(1).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const apply_slug = slugify(data.full_name);
    const { data: row, error } = await supabaseAdmin
      .from("dm_setters")
      .insert({
        full_name: data.full_name,
        email,
        is_manager: data.is_manager,
        manager_id: data.is_manager ? null : (data.manager_id ?? null),
        apply_slug,
        commission_rate: data.is_manager ? 0.075 : (data.commission_rate ?? 0.075),
      })
      .select("id, apply_slug")
      .single();
    if (error) throw new Error(error.message);


    let newUserId: string | undefined;
    const { data: created, error: uerr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: DEFAULT_DM_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (uerr) {
      // Auth user already exists — reuse it and reset password so the invite works.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list?.users?.find((u: { email?: string | null }) => (u.email || "").toLowerCase() === email);
      if (!existing) throw new Error(uerr.message);
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: DEFAULT_DM_PASSWORD });
      newUserId = existing.id;
    } else {
      newUserId = created.user?.id;
    }
    if (newUserId) {
      await supabaseAdmin.from("profiles").update({
        must_change_password: true, full_name: data.full_name,
      }).eq("user_id", newUserId);
    }
    await sendDmSetterInviteEmail({
      setterId: row.id,
      email,
      fullName: data.full_name,
      password: DEFAULT_DM_PASSWORD,
    });
    return { id: row.id, apply_slug: row.apply_slug, default_password: DEFAULT_DM_PASSWORD };
  });

async function sendDmSetterInviteEmail(input: {
  setterId: string;
  email: string;
  fullName: string;
  password: string;
}) {
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    await sendTransactional({
      templateName: "setter-invite",
      recipientEmail: input.email,
      idempotencyKey: `dm-setter-invite-${input.setterId}-${Date.now()}`,
      templateData: {
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        loginUrl: "https://conversionlab.space/app/auth",
      },
    });
  } catch (e) {
    console.error("sendDmSetterInviteEmail failed", e);
  }
}

export const resendDmSetterInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setter, error } = await supabaseAdmin
      .from("dm_setters").select("id, email, full_name").eq("id", data.id).single();
    if (error || !setter) throw new Error(error?.message || "DM setter not found");
    const email = (setter.email || "").toLowerCase();

    const { data: userRow } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = userRow?.users?.find((u) => (u.email || "").toLowerCase() === email);
    if (authUser) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: DEFAULT_DM_PASSWORD });
      await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("user_id", authUser.id);
    } else {
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_DM_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: setter.full_name },
      });
    }
    await sendDmSetterInviteEmail({
      setterId: setter.id,
      email,
      fullName: setter.full_name ?? "",
      password: DEFAULT_DM_PASSWORD,
    });
    return { ok: true };
  });

export const deleteDmSetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("dm_setters").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDmSetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    manager_id: z.string().uuid().nullable().optional(),
    daily_target: z.number().int().min(1).max(1000).optional(),
    full_name: z.string().trim().min(1).max(200).optional(),
    commission_rate: z.number().min(0).max(1).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      manager_id?: string | null;
      daily_target?: number;
      full_name?: string;
      commission_rate?: number;
    } = {};
    if (data.manager_id !== undefined) patch.manager_id = data.manager_id;
    if (data.daily_target !== undefined) patch.daily_target = data.daily_target;
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.commission_rate !== undefined) patch.commission_rate = data.commission_rate;
    const { error } = await supabaseAdmin.from("dm_setters").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/* -------------------------------------------------------------------------- */
/*  Public: resolve slug on the /apply page                                    */
/* -------------------------------------------------------------------------- */

export const resolveDmSlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(80) }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("dm_setters")
      .select("id, full_name, apply_slug")
      .eq("apply_slug", data.slug)
      .maybeSingle();
    if (!row) return null;
    return { id: row.id, full_name: row.full_name, slug: row.apply_slug };
  });

/* -------------------------------------------------------------------------- */
/*  DM setter (self): profile, stats, daily logs, AI counting                  */
/* -------------------------------------------------------------------------- */

export const getMyDmSetter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("dm_setters").select("*").eq("user_id", context.userId).maybeSingle();
    return data ?? null;
  });

type LeadStats = {
  applied: number;
  booked: number;
  no_show: number;
  disqualified: number;
  not_interested: number;
  closed: number;
  total_revenue: number;
  total_commission: number;
};

async function computeStatsFor(setterId: string, range?: { from?: string; to?: string }, rate = 0.075) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let appsQ = supabaseAdmin.from("applications").select("id, created_at, full_name, email, phone").eq("dm_setter_id", setterId);
  let bookQ = supabaseAdmin.from("closer_bookings")
    .select("id, applicant_name, applicant_email, slot_start, status, outcome, deal_amount, commission_percent, commission_amount")
    .eq("dm_setter_id", setterId);
  if (range?.from) {
    appsQ = appsQ.gte("created_at", range.from);
    bookQ = bookQ.gte("slot_start", range.from);
  }
  if (range?.to) {
    appsQ = appsQ.lt("created_at", range.to);
    bookQ = bookQ.lt("slot_start", range.to);
  }
  const [{ data: apps }, { data: bookings }] = await Promise.all([appsQ, bookQ]);
  const stats: LeadStats = {
    applied: (apps ?? []).length,
    booked: 0, no_show: 0, disqualified: 0, not_interested: 0, closed: 0,
    total_revenue: 0, total_commission: 0,
  };
  for (const b of bookings ?? []) {
    stats.booked += 1;
    if (b.outcome === "closed") stats.closed += 1;
    else if (b.outcome === "no_show") stats.no_show += 1;
    else if (b.outcome === "disqualified") stats.disqualified += 1;
    else if (b.outcome === "not_interested") stats.not_interested += 1;
    if (b.outcome === "closed" && b.deal_amount) {
      stats.total_revenue += Number(b.deal_amount);
      stats.total_commission += Number(b.deal_amount) * rate;
    }
  }
  return { stats, applications: apps ?? [], bookings: bookings ?? [] };
}


export const getMyDmStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("dm_setters").select("id, daily_target, apply_slug, full_name, commission_rate").eq("user_id", context.userId).maybeSingle();
    if (!me) throw new Error("Not a DM setter");
    const stats = await computeStatsFor(me.id, undefined, Number(me.commission_rate ?? 0.075));

    // Today's log
    const { data: log } = await context.supabase
      .from("dm_daily_logs").select("*").eq("dm_setter_id", me.id).eq("log_date", todayKey()).maybeSingle();
    // Recent logs
    const { data: recent } = await context.supabase
      .from("dm_daily_logs").select("*").eq("dm_setter_id", me.id).order("log_date", { ascending: false }).limit(14);
    // Recent recipients (most recent 100)
    const { data: recipients } = await context.supabase
      .from("dm_recipients")
      .select("id, name_original, platform, created_at")
      .eq("dm_setter_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const { count: recipientCount } = await context.supabase
      .from("dm_recipients")
      .select("id", { count: "exact", head: true })
      .eq("dm_setter_id", me.id);
    return {
      dmSetter: me,
      todayLog: log,
      recentLogs: recent ?? [],
      recipients: recipients ?? [],
      recipientTotal: recipientCount ?? 0,
      ...stats,
    };
  });

const LogImagesSchema = z.object({
  images: z.array(z.string().max(20_000_000)).min(1).max(50), // base64 data URLs
});

function normalizeName(n: string) {
  return n.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, " ");
}

// BYO routing: if GEMINI_API_KEY is set, call Google's Gemini API directly.
// Otherwise fall back to the Lovable AI Gateway using LOVABLE_API_KEY.
async function countDmsWithAI(imageDataUrls: string[]): Promise<{
  total: number;
  per: Array<{ count: number; names: string[]; platform: "instagram" | "tiktok" | "other"; raw: unknown }>;
}> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const useDirect = !!geminiKey;
  const per: Array<{ count: number; names: string[]; platform: "instagram" | "tiktok" | "other"; raw: unknown }> = [];
  let total = 0;

  const systemPrompt =
    'You are analyzing a screenshot of a social media DM inbox or conversation UI. ' +
    'Identify the platform: respond with "instagram" if the UI is Instagram, "tiktok" if it is TikTok, or "other" if it is a different platform. ' +
    'Identify each distinct outbound direct message the account owner sent in the screenshot. ' +
    'Also extract the recipient usernames or display names visible for those conversations (one per conversation). ' +
    'Respond with ONLY a JSON object of the form ' +
    '{"platform": "instagram" | "tiktok" | "other", "count": <integer>, "names": ["name1","name2",...]}. ' +
    'Use the @username if visible, otherwise the display name. No other text.';

  for (const img of imageDataUrls) {
    if (!useDirect && !lovableKey) { per.push({ count: 0, names: [], platform: "other", raw: { error: "no_api_key" } }); continue; }
    try {
      let txt = "";
      if (useDirect) {
        const m = img.match(/^data:([^;]+);base64,(.+)$/);
        const mime = m?.[1] ?? "image/png";
        const b64 = m?.[2] ?? "";
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{
                role: "user",
                parts: [
                  { text: "Count outbound DMs and list recipient names for this screenshot." },
                  { inline_data: { mime_type: mime, data: b64 } },
                ],
              }],
            }),
          },
        );
        if (!res.ok) { per.push({ count: 0, names: [], platform: "other", raw: { status: res.status, provider: "google" } }); continue; }
        const j = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      } else {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: "Count outbound DMs and list recipient names for this screenshot." },
                  { type: "image_url", image_url: { url: img } },
                ],
              },
            ],
          }),
        });
        if (!res.ok) { per.push({ count: 0, names: [], platform: "other", raw: { status: res.status, provider: "lovable" } }); continue; }
        const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
        txt = j.choices?.[0]?.message?.content ?? "";
      }
      const m = txt.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) as { platform?: unknown; count?: number; names?: unknown } : { platform: "other", count: 0, names: [] };
      const c = Math.max(0, Math.min(500, Number(parsed.count) || 0));
      const namesArr = Array.isArray(parsed.names)
        ? (parsed.names as unknown[]).map((n) => String(n ?? "").trim()).filter((n) => n.length > 0 && n.length < 200)
        : [];
      const rawPlatform = String(parsed.platform ?? "").toLowerCase();
      const detectedPlatform: "instagram" | "tiktok" | "other" = rawPlatform === "instagram" ? "instagram" : rawPlatform === "tiktok" ? "tiktok" : "other";
      total += c;
      per.push({ count: c, names: namesArr, platform: detectedPlatform, raw: { text: txt, provider: useDirect ? "google" : "lovable" } });
    } catch (e) {
      per.push({ count: 0, names: [], platform: "other", raw: { error: (e as Error).message } });
    }
  }
  return { total, per };
}

export const logDmScreenshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LogImagesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("dm_setters").select("id, daily_target, apply_slug, full_name").eq("user_id", context.userId).maybeSingle();
    if (!me) throw new Error("Not a DM setter");

    // Upsert today's log
    const date = todayKey();
    const { data: existing } = await supabaseAdmin
      .from("dm_daily_logs").select("*").eq("dm_setter_id", me.id).eq("log_date", date).maybeSingle();
    let logId = existing?.id;
    if (!logId) {
      const { data: created, error: cerr } = await supabaseAdmin.from("dm_daily_logs").insert({
        dm_setter_id: me.id, log_date: date, ai_count: 0, manual_adjustment: 0, target: me.daily_target ?? 100,
      }).select("id").single();
      if (cerr) throw new Error(cerr.message);
      logId = created.id;
    }

    // AI count + name extraction
    const { total, per } = await countDmsWithAI(data.images);

    // For each image: collect its candidate names (dedupe within batch across images),
    // then insert new-unique recipients. Count = sum over images of (names ? new_unique_from_that_image : raw_count).
    const seenInBatch = new Set<string>();
    const perImageCandidates: Array<Array<{ normalized: string; original: string; platform: "instagram" | "tiktok" | "other" }>> = [];
    const allCandidates: Array<{ normalized: string; original: string; platform: "instagram" | "tiktok" | "other" }> = [];
    for (const p of per) {
      const imgCands: Array<{ normalized: string; original: string; platform: "instagram" | "tiktok" | "other" }> = [];
      for (const raw of p.names) {
        const norm = normalizeName(raw);
        if (!norm || seenInBatch.has(norm)) continue;
        seenInBatch.add(norm);
        const c = { normalized: norm, original: raw, platform: p.platform };
        imgCands.push(c);
        allCandidates.push(c);
      }
      perImageCandidates.push(imgCands);
    }

    let existingSet = new Set<string>();
    if (allCandidates.length) {
      const { data: existingRows } = await supabaseAdmin
        .from("dm_recipients")
        .select("name_normalized")
        .eq("dm_setter_id", me.id)
        .in("name_normalized", allCandidates.map((c) => c.normalized));
      existingSet = new Set((existingRows ?? []).map((r) => r.name_normalized));
    }
    const newNames = allCandidates.filter((c) => !existingSet.has(c.normalized));

    const uploadRows = data.images.map((_img, i) => ({
      dm_daily_log_id: logId!,
      dm_setter_id: me.id,
      image_path: `inline-${Date.now()}-${i}`,
      platform: per[i]?.platform ?? "other",
      ai_count: per[i]?.count ?? 0,
      ai_raw: per[i]?.raw as never,
      status: "counted",
    }));
    if (uploadRows.length) {
      await supabaseAdmin.from("dm_log_uploads").insert(uploadRows);
    }

    if (newNames.length) {
      await supabaseAdmin
        .from("dm_recipients")
        .insert(newNames.map((n) => ({
          dm_setter_id: me.id,
          dm_daily_log_id: logId!,
          name_normalized: n.normalized,
          name_original: n.original,
          platform: n.platform,
        })));
    }

    // Per-image count: if that image produced names, count only its NEW-unique names; else fall back to its raw AI count.
    let addToCount = 0;
    for (let i = 0; i < per.length; i++) {
      const cands = perImageCandidates[i] ?? [];
      if (cands.length > 0) {
        addToCount += cands.filter((c) => !existingSet.has(c.normalized)).length;
      } else {
        addToCount += per[i]?.count ?? 0;
      }
    }
    const duplicatesSkipped = allCandidates.length - newNames.length;

    const newCount = (existing?.ai_count ?? 0) + addToCount;
    await supabaseAdmin.from("dm_daily_logs").update({ ai_count: newCount }).eq("id", logId!);

    return {
      added: addToCount,
      ai_detected: total,
      duplicates_skipped: duplicatesSkipped,
      new_names: newNames.map((n) => n.original),
      total_today: newCount + (existing?.manual_adjustment ?? 0),
    };
  });

export const adjustDmDailyLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ delta: z.number().int().min(-500).max(500) }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("dm_setters").select("id, daily_target, apply_slug, full_name").eq("user_id", context.userId).maybeSingle();
    if (!me) throw new Error("Not a DM setter");
    const date = todayKey();
    const { data: existing } = await supabaseAdmin
      .from("dm_daily_logs").select("*").eq("dm_setter_id", me.id).eq("log_date", date).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("dm_daily_logs").update({
        manual_adjustment: (existing.manual_adjustment ?? 0) + data.delta,
      }).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("dm_daily_logs").insert({
        dm_setter_id: me.id, log_date: date, ai_count: 0, manual_adjustment: data.delta, target: me.daily_target ?? 100,
      });
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Manager view                                                               */
/* -------------------------------------------------------------------------- */

export const getMyDmTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin.from("dm_setters").select("*").eq("user_id", context.userId).maybeSingle();
    if (!me) throw new Error("Not a DM setter");
    const { stats: myStats } = await computeStatsFor(me.id, undefined, Number(me.commission_rate ?? 0.075));
    const { data: myLog } = await supabaseAdmin
      .from("dm_daily_logs").select("*").eq("dm_setter_id", me.id).eq("log_date", todayKey()).maybeSingle();
    if (!me.is_manager) return { manager: me, myStats, myLog, team: [] };
    const { data: team } = await supabaseAdmin.from("dm_setters").select("*").eq("manager_id", me.id);
    const rows = await Promise.all((team ?? []).map(async (s) => {
      const { stats } = await computeStatsFor(s.id, undefined, Number(s.commission_rate ?? 0.075));
      const { data: log } = await supabaseAdmin.from("dm_daily_logs").select("ai_count, manual_adjustment").eq("dm_setter_id", s.id).eq("log_date", todayKey()).maybeSingle();
      const today_dms = (log?.ai_count ?? 0) + (log?.manual_adjustment ?? 0);
      return { setter: s, stats, today_dms, manager_commission: stats.total_revenue * 0.025 };
    }));

    return { manager: me, myStats, myLog, team: rows };
  });

/* -------------------------------------------------------------------------- */
/*  Admin: DM setter detail                                                    */
/* -------------------------------------------------------------------------- */

async function sumDmsInRange(setterId: string, from?: string | null, to?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("dm_daily_logs").select("ai_count, manual_adjustment, log_date").eq("dm_setter_id", setterId);
  if (from) q = q.gte("log_date", from.slice(0, 10));
  if (to) q = q.lte("log_date", to.slice(0, 10));
  const { data } = await q;
  let total = 0;
  for (const r of data ?? []) total += (r.ai_count ?? 0) + (r.manual_adjustment ?? 0);
  return { total, days_logged: (data ?? []).length };
}

function daysInRange(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  const a = new Date(from.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(to.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export const getAdminDmSetterDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    from: z.string().datetime().nullable().optional(),
    to: z.string().datetime().nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setter } = await supabaseAdmin.from("dm_setters").select("*").eq("id", data.id).maybeSingle();
    if (!setter) throw new Error("Not found");

    // Recipients query, optionally filtered to the same date range
    let recipQ = supabaseAdmin
      .from("dm_recipients")
      .select("id, name_original, platform, created_at")
      .eq("dm_setter_id", setter.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.from) recipQ = recipQ.gte("created_at", data.from);
    if (data.to) recipQ = recipQ.lte("created_at", data.to);

    const [{ stats, applications, bookings }, logs, dmSum, recipientsRes] = await Promise.all([
      computeStatsFor(setter.id, { from: data.from ?? undefined, to: data.to ?? undefined }, Number(setter.commission_rate ?? 0.075)),
      supabaseAdmin.from("dm_daily_logs").select("*").eq("dm_setter_id", setter.id).order("log_date", { ascending: false }).limit(30),
      sumDmsInRange(setter.id, data.from, data.to),
      recipQ,
    ]);

    const rangeDays = daysInRange(data.from, data.to);

    type TeamRow = {
      setter: typeof setter;
      dms: number;
      days_logged: number;
      target: number;
      target_total: number;
      kpi_percent: number;
    };
    let team: TeamRow[] = [];
    if (setter.is_manager) {
      const { data: teamRows } = await supabaseAdmin.from("dm_setters").select("*").eq("manager_id", setter.id);
      team = await Promise.all((teamRows ?? []).map(async (s): Promise<TeamRow> => {
        const { total, days_logged } = await sumDmsInRange(s.id, data.from, data.to);
        const perDayTarget = s.daily_target ?? 100;
        const days = rangeDays ?? Math.max(1, days_logged);
        const target_total = perDayTarget * days;
        return {
          setter: s,
          dms: total,
          days_logged,
          target: perDayTarget,
          target_total,
          kpi_percent: target_total > 0 ? Math.round((total / target_total) * 100) : 0,
        };
      }));
    }

    return {
      setter,
      stats,
      applications,
      bookings,
      logs: logs.data ?? [],
      dmSum,
      rangeDays,
      team,
      recipients: recipientsRes.data ?? [],
    };
  });

export const listDmManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("dm_setters").select("id, full_name, email").eq("is_manager", true).order("full_name");
    return data ?? [];
  });

export const listMyDmBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("dm_setters").select("id, is_manager").eq("user_id", context.userId).maybeSingle();
    if (!me) throw new Error("Not a DM setter");

    // Collect setter ids: self + team (if manager)
    const setterIds: string[] = [me.id];
    if (me.is_manager) {
      const { data: team } = await supabaseAdmin
        .from("dm_setters").select("id").eq("manager_id", me.id);
      for (const t of team ?? []) setterIds.push(t.id);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("closer_bookings")
      .select("id, application_id, slot_start, status, zoom_join_url, applicant_name, applicant_email, applicant_phone, outcome, dm_setter_id, closers:assigned_closer_id (full_name, email)")
      .in("dm_setter_id", setterIds)
      .order("slot_start", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
