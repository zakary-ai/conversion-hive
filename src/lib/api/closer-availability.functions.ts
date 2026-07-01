import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z.object({
  start_minute: z.number().int().min(0).max(24 * 60),
  end_minute: z.number().int().min(0).max(24 * 60),
});
const daySchema = z.object({
  day: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  ranges: z.array(rangeSchema),
});
const weeklySchema = z.array(daySchema);
const lineSchema = z.enum(["b2b", "b2c"]);

export type WeeklyDay = z.infer<typeof daySchema>;
export type Weekly = WeeklyDay[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}

export const getMyAvailabilityDeclaration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ line: lineSchema }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase.from("closer_availability_declarations") as any)
      .select("weekly, notes, updated_at")
      .eq("closer_user_id", userId)
      .eq("line", data.line)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as { weekly: Weekly; notes: string; updated_at: string } | null;
  });

export const saveMyAvailabilityDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ line: lineSchema, weekly: weeklySchema, notes: z.string().max(5000) }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("closer_availability_declarations") as any).upsert(
      {
        closer_user_id: userId,
        line: data.line,
        weekly: data.weekly,
        notes: data.notes,
        updated_by: userId,
      },
      { onConflict: "closer_user_id,line" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAvailabilityDeclarations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ line: lineSchema }).parse)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabase } = context;

    // Fetch closers for the line
    const table = data.line === "b2b" ? "b2b_closers" : "closers";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: closers, error: cErr } = await (supabase.from(table) as any)
      .select("id, user_id, full_name, email, active")
      .order("full_name");
    if (cErr) throw new Error(cErr.message);

    const userIds = (closers ?? []).map((c: { user_id: string | null }) => c.user_id).filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: decls, error: dErr } = await (supabase.from("closer_availability_declarations") as any)
      .select("closer_user_id, weekly, notes, updated_at")
      .eq("line", data.line)
      .in("closer_user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    if (dErr) throw new Error(dErr.message);

    const byUser = new Map<string, { weekly: Weekly; notes: string; updated_at: string }>();
    for (const d of decls ?? []) byUser.set(d.closer_user_id, d);

    return (closers ?? []).map((c: { id: string; user_id: string | null; full_name: string; email: string; active: boolean }) => ({
      closer_id: c.id,
      closer_user_id: c.user_id,
      full_name: c.full_name,
      email: c.email,
      active: c.active,
      declaration: c.user_id ? byUser.get(c.user_id) ?? null : null,
    }));
  });

export const adminSaveAvailabilityDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      closer_user_id: z.string().uuid(),
      line: lineSchema,
      weekly: weeklySchema,
      notes: z.string().max(5000),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("closer_availability_declarations") as any).upsert(
      {
        closer_user_id: data.closer_user_id,
        line: data.line,
        weekly: data.weekly,
        notes: data.notes,
        updated_by: userId,
      },
      { onConflict: "closer_user_id,line" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// For closer home page: determine which lines the current user belongs to
export const getMyCloserLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [b2c, b2b] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("closers") as any).select("id").eq("user_id", userId).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("b2b_closers") as any).select("id").eq("user_id", userId).maybeSingle(),
    ]);
    return { b2c: !!b2c.data, b2b: !!b2b.data };
  });
