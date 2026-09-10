import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listPifPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows, error }, { data: sync }] = await Promise.all([
      supabaseAdmin
        .from("pif_payments")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("posted_at", { ascending: false }),
      supabaseAdmin.from("pif_payment_sync").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], sync: sync ?? null };
  });

export const syncPifPaymentsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { syncPifPayments, recordSyncFailure } = await import("@/lib/pif-payments.server");
    try {
      return await syncPifPayments();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await recordSyncFailure(message);
      throw new Error(message);
    }
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  person_name: z.string().trim().max(200).nullable().optional(),
  amount_due: z.number().nonnegative().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  payment_method: z.string().trim().max(60).nullable().optional(),
  recurrence_note: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["due", "paid", "skipped"]).optional(),
  needs_review: z.boolean().optional(),
});

export const updatePifPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, status, ...fields } = data;
    const patch: {
      manually_edited: boolean;
      status?: string;
      paid_at?: string | null;
      needs_review?: boolean;
    } & Omit<typeof fields, "needs_review"> = { ...fields, manually_edited: true };
    if (status) {
      patch.status = status;
      patch.paid_at = status === "paid" ? new Date().toISOString() : null;
    }
    if (Object.keys(fields).length > 0) patch.needs_review = data.needs_review ?? false;
    const { error } = await supabaseAdmin.from("pif_payments").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePifPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pif_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
