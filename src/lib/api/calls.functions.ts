import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

async function assertAdmin(
  supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "client" }) => unknown },
  userId: string,
) {
  const res = await (supabase.rpc("has_role", { _user_id: userId, _role: "admin" }) as Promise<{ data: boolean | null }>);
  if (!res.data) throw new Error("Forbidden");
}

// ---------- Start a call ----------
// Logs the attempt and returns the lead's number. The client opens the Quo
// (OpenPhone) app via a deep link, falling back to the device dialer.
// Setters are invited to the shared Quo workspace by an admin; we don't
// assign per-setter numbers from the app anymore.
export const startBridgeCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead } = await supabase
      .from("leads").select("id, phone, name").eq("id", data.lead_id).maybeSingle();
    if (!lead) throw new Error("Lead not found");
    if (!lead.phone) throw new Error("Lead has no phone number");

    const toNumber = normalizeE164(lead.phone);

    const { data: log } = await supabase.from("call_logs").insert({
      lead_id: lead.id,
      user_id: userId,
      openphone_call_id: null,
      direction: "outbound",
      status: "initiated",
      from_number: null,
      to_number: toNumber,
      started_at: new Date().toISOString(),
    }).select("id").maybeSingle();

    await supabase.from("leads").update({ contacted_at: new Date().toISOString() }).eq("id", lead.id);

    return { ok: true, call_log_id: log?.id, dial: toNumber, from: null as string | null };
  });

// ---------- Call history ----------
export const listCallsForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lead_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("call_logs").select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCallsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ user_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("call_logs").select("*, leads:lead_id(name, company)")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
