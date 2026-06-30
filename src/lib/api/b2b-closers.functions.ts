// B2B Closer admin/CRUD — fully separate pool from B2C closers
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DEFAULT_B2B_CLOSER_PASSWORD = "ConversionLab1095!";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listB2bClosers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase.from("b2b_closers") as any)
      .select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; user_id: string | null; full_name: string; email: string; active: boolean; created_at: string; updated_at: string }>;
  });

export const createB2bCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin.from("b2b_closers") as any).insert({
      full_name: data.full_name,
      email,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // Create or reuse auth user. If a user with this email already exists (e.g. they are
    // also a B2C closer), just link them via handle_new_user-style logic.
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existing?.users?.find((u) => (u.email || "").toLowerCase() === email);

    let userId = existingUser?.id ?? null;
    if (!userId) {
      const { data: created, error: userErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_B2B_CLOSER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (userErr) throw new Error(userErr.message);
      userId = created.user?.id ?? null;
    } else {
      // Reset password so the emailed credentials work for them
      await supabaseAdmin.auth.admin.updateUserById(existingUser!.id, { password: DEFAULT_B2B_CLOSER_PASSWORD });
    }

    if (userId) {
      // Link b2b_closers row to user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("b2b_closers") as any).update({ user_id: userId }).eq("id", row.id);
      // Force password change
      await supabaseAdmin.from("profiles").update({ must_change_password: true, full_name: data.full_name }).eq("user_id", userId);
      // Ensure they have the closer role
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("user_roles") as any).upsert(
        { user_id: userId, role: "closer" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    }

    await sendB2bCloserInviteEmail({
      closerId: row.id,
      email,
      fullName: data.full_name,
      password: DEFAULT_B2B_CLOSER_PASSWORD,
    });

    return { id: row.id, default_password: DEFAULT_B2B_CLOSER_PASSWORD };
  });

async function sendB2bCloserInviteEmail(input: {
  closerId: string;
  email: string;
  fullName: string;
  password: string;
}) {
  try {
    const { sendTransactional } = await import("@/lib/email/transactional.server");
    await sendTransactional({
      templateName: "closer-invite",
      recipientEmail: input.email,
      idempotencyKey: `b2b-closer-invite-${input.closerId}-${Date.now()}`,
      templateData: {
        closerName: input.fullName,
        email: input.email,
        password: input.password,
        loginUrl: "https://conversionlab.space/app/auth",
      },
    });
  } catch (e) {
    console.error("sendB2bCloserInviteEmail failed", e);
  }
}

export const resendB2bCloserInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closer, error } = await (supabaseAdmin.from("b2b_closers") as any)
      .select("id, email, full_name").eq("id", data.id).single();
    if (error || !closer) throw new Error(error?.message || "B2B closer not found");

    const { data: userRow } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = userRow?.users?.find((u) => (u.email || "").toLowerCase() === closer.email.toLowerCase());
    if (authUser) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: DEFAULT_B2B_CLOSER_PASSWORD });
      await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("user_id", authUser.id);
    } else {
      await supabaseAdmin.auth.admin.createUser({
        email: closer.email,
        password: DEFAULT_B2B_CLOSER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: closer.full_name },
      });
    }

    await sendB2bCloserInviteEmail({
      closerId: closer.id,
      email: closer.email,
      fullName: closer.full_name,
      password: DEFAULT_B2B_CLOSER_PASSWORD,
    });
    return { ok: true };
  });

export const updateB2bCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid(),
    full_name: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional(),
    zoom_account_id: z.string().trim().max(200).nullable().optional(),
    zoom_client_id: z.string().trim().max(200).nullable().optional(),
    zoom_client_secret: z.string().trim().max(500).nullable().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, zoom_account_id, zoom_client_id, zoom_client_secret, ...rest } = data;
    const patch: { full_name?: string; active?: boolean } = {};
    if (rest.full_name !== undefined) patch.full_name = rest.full_name;
    if (rest.active !== undefined) patch.active = rest.active;
    if (Object.keys(patch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (context.supabase.from("b2b_closers") as any).update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }
    const hasZoom = zoom_account_id !== undefined || zoom_client_id !== undefined || zoom_client_secret !== undefined;
    if (hasZoom) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const allCleared = zoom_account_id === null && zoom_client_id === null && zoom_client_secret === null;
      if (allCleared) {
        await supabaseAdmin.from("b2b_closer_zoom_credentials").delete().eq("closer_id", id);
      } else {
        const upsert: { closer_id: string; zoom_account_id?: string | null; zoom_client_id?: string | null; zoom_client_secret?: string | null; updated_at: string } = { closer_id: id, updated_at: new Date().toISOString() };
        if (zoom_account_id !== undefined) upsert.zoom_account_id = zoom_account_id;
        if (zoom_client_id !== undefined) upsert.zoom_client_id = zoom_client_id;
        if (zoom_client_secret !== undefined) upsert.zoom_client_secret = zoom_client_secret;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabaseAdmin.from("b2b_closer_zoom_credentials") as any)
          .upsert(upsert, { onConflict: "closer_id" });
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const deleteB2bCloser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("b2b_closers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getB2bCloserZoomCreds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("b2b_closer_zoom_credentials")
      .select("zoom_account_id, zoom_client_id, zoom_client_secret")
      .eq("closer_id", data.closer_id)
      .maybeSingle();
    return {
      zoom_account_id: (row?.zoom_account_id as string | null) ?? null,
      zoom_client_id: (row?.zoom_client_id as string | null) ?? null,
      zoom_client_secret: (row?.zoom_client_secret as string | null) ?? null,
    };
  });

export const listB2bClosersZoomStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("b2b_closer_zoom_credentials")
      .select("closer_id, zoom_account_id, zoom_client_id, zoom_client_secret");
    const map: Record<string, boolean> = {};
    for (const r of data ?? []) {
      map[r.closer_id as string] = !!(r.zoom_account_id && r.zoom_client_id && r.zoom_client_secret);
    }
    return map;
  });

// ---------- B2B closer availability ----------
const RuleSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(1440),
});

export const listB2bCloserAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase.from("b2b_closer_availability_rules") as any)
      .select("id, day_of_week, start_minute, end_minute")
      .eq("closer_id", data.closer_id)
      .order("day_of_week");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ id: string; day_of_week: number; start_minute: number; end_minute: number }>;
  });

export const replaceB2bCloserAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    closer_id: z.string().uuid(),
    rules: z.array(RuleSchema).max(100),
  }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) {
      const { data: c } = await context.supabase
        .from("b2b_closers").select("id").eq("id", data.closer_id).eq("user_id", context.userId).maybeSingle();
      if (!c) throw new Error("Forbidden");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const del = await (supabaseAdmin.from("b2b_closer_availability_rules") as any)
      .delete().eq("closer_id", data.closer_id);
    if (del.error) throw new Error(del.error.message);
    if (data.rules.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ins = await (supabaseAdmin.from("b2b_closer_availability_rules") as any).insert(
        data.rules.map((r) => ({ ...r, closer_id: data.closer_id })),
      );
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });

// ---------- Admin: B2B closer detail ----------
export const getB2bCloserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ closer_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closer } = await (supabaseAdmin.from("b2b_closers") as any)
      .select("id, full_name, email, active").eq("id", data.closer_id).single();
    if (!closer) throw new Error("B2B closer not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appts } = await (supabaseAdmin.from("appointments") as any)
      .select("id, name, email, scheduled_at, status, outcome, outcome_set_at, deal_amount, commission_amount, lost_reason, meeting_url")
      .eq("type", "booking")
      .eq("b2b_closer_id", data.closer_id)
      .order("scheduled_at", { ascending: false });

    return {
      closer: closer as { id: string; full_name: string; email: string; active: boolean },
      appointments: (appts ?? []) as Array<{
        id: string; name: string; email: string | null; scheduled_at: string; status: string;
        outcome: string | null; outcome_set_at: string | null;
        deal_amount: number | string | null; commission_amount: number | string | null;
        lost_reason: string | null; meeting_url: string | null;
      }>,
    };
  });
