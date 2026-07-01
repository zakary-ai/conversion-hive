import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) throw new Error("Forbidden");
}

export type B2BCommissionEntry = {
  id: string;
  role: "setter" | "closer" | "manual" | null;
  user_id: string;
  user_name: string;
  amount: number;
  commission_percent: number | null;
  deal_amount: number | null;
  status: string;
  note: string | null;
  created_at: string;
  approved_at: string | null;
  appointment_id: string | null;
  paid_at: string | null;
  paid_note: string | null;
};


export type B2BCommissionGroup = {
  key: string;
  appointment_id: string | null;
  appointment_name: string | null;
  scheduled_at: string | null;
  deal_amount: number | null;
  created_at: string;
  status: "pending" | "approved" | "mixed";
  setter: B2BCommissionEntry | null;
  closer: B2BCommissionEntry | null;
  extras: B2BCommissionEntry[];
};

// Returns commission entries + groups, restricted to B2B appointments
// (or manual/orphan rows). Also returns lookups for the "+" dialog.
export const listB2BCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabase } = context;

    // Pull all commissions with appointment info
    const { data: rows } = await supabase
      .from("commissions")
      .select("*")
      .order("created_at", { ascending: false });
    const commissionRows = (rows ?? []) as Array<{
      id: string; user_id: string; role: string | null;
      amount: number | string; commission_percent: number | string | null;
      deal_amount: number | string | null; status: string | null;
      note: string | null; created_at: string; approved_at: string | null;
      appointment_id: string | null;
      paid_at: string | null; paid_note: string | null;
    }>;

    // Pull relevant appointments (B2B only)
    const apptIds = Array.from(new Set(commissionRows.map((r) => r.appointment_id).filter((v): v is string => !!v)));
    let apptMap = new Map<string, { id: string; name: string | null; scheduled_at: string | null; user_id: string; b2b_closer_id: string | null }>();
    if (apptIds.length > 0) {
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, name, scheduled_at, user_id, b2b_closer_id, assigned_closer_id")
        .in("id", apptIds);
      for (const a of (appts ?? []) as Array<{ id: string; name: string | null; scheduled_at: string | null; user_id: string; b2b_closer_id: string | null; assigned_closer_id: string | null }>) {
        // B2B scope only: has a b2b_closer_id OR no b2c assigned_closer_id (manual outcomes on non-b2c)
        if (a.b2b_closer_id || !a.assigned_closer_id) {
          apptMap.set(a.id, { id: a.id, name: a.name, scheduled_at: a.scheduled_at, user_id: a.user_id, b2b_closer_id: a.b2b_closer_id });
        }
      }
    }

    // Filter commissions: keep those tied to a B2B appointment OR orphan manual/setter/closer rows
    const scoped = commissionRows.filter((r) => !r.appointment_id || apptMap.has(r.appointment_id));

    // Resolve user names
    const userIds = Array.from(new Set(scoped.map((r) => r.user_id)));
    const nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      for (const p of (profs ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
        nameMap.set(p.user_id, p.full_name || p.email || p.user_id.slice(0, 8));
      }
    }

    // Build entries
    const entries: B2BCommissionEntry[] = scoped.map((r) => ({
      id: r.id,
      role: (r.role as B2BCommissionEntry["role"]) ?? null,
      user_id: r.user_id,
      user_name: nameMap.get(r.user_id) ?? r.user_id.slice(0, 8),
      amount: Number(r.amount ?? 0),
      commission_percent: r.commission_percent != null ? Number(r.commission_percent) : null,
      deal_amount: r.deal_amount != null ? Number(r.deal_amount) : null,
      status: (r.status ?? "pending") as string,
      note: r.note,
      created_at: r.created_at,
      approved_at: r.approved_at,
      appointment_id: r.appointment_id,
      paid_at: r.paid_at,
      paid_note: r.paid_note,
    }));

    // Group by appointment_id (fallback to own id for orphans)
    const groups = new Map<string, B2BCommissionGroup>();
    for (const e of entries) {
      const key = e.appointment_id ?? `orphan:${e.id}`;
      const appt = e.appointment_id ? apptMap.get(e.appointment_id) : null;
      const g = groups.get(key) ?? {
        key,
        appointment_id: e.appointment_id,
        appointment_name: appt?.name ?? null,
        scheduled_at: appt?.scheduled_at ?? null,
        deal_amount: e.deal_amount,
        created_at: e.created_at,
        status: "pending" as "pending" | "approved" | "mixed",
        setter: null,
        closer: null,
        extras: [],
      };
      if (e.role === "setter" && !g.setter) g.setter = e;
      else if (e.role === "closer" && !g.closer) g.closer = e;
      else if (e.role === "manual" && !g.closer && !e.appointment_id) g.closer = e; // orphan manual shows as primary
      else g.extras.push(e);
      if (!g.deal_amount && e.deal_amount) g.deal_amount = e.deal_amount;
      if (e.created_at < g.created_at) g.created_at = e.created_at;
      groups.set(key, g);
    }
    // Compute group status
    for (const g of groups.values()) {
      const all = [g.setter, g.closer, ...g.extras].filter(Boolean) as B2BCommissionEntry[];
      const anyPending = all.some((x) => x.status === "pending");
      const anyApproved = all.some((x) => x.status === "approved");
      g.status = anyPending && anyApproved ? "mixed" : anyPending ? "pending" : "approved";
    }

    const groupList = Array.from(groups.values()).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

    // Lookups for the "+" dialog
    const [{ data: clientRoles }, { data: b2bClosers }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "client"),
      supabase.from("b2b_closers").select("id, user_id, full_name, email").eq("active", true),
    ]);
    const clientIds = (clientRoles ?? []).map((r: { user_id: string }) => r.user_id);
    let setters: Array<{ user_id: string; name: string }> = [];
    if (clientIds.length > 0) {
      const { data: setterProfs } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", clientIds);
      setters = ((setterProfs ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>)
        .map((p) => ({ user_id: p.user_id, name: p.full_name || p.email || p.user_id.slice(0, 8) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const closers = ((b2bClosers ?? []) as Array<{ user_id: string | null; full_name: string | null; email: string | null }>)
      .filter((c) => !!c.user_id)
      .map((c) => ({ user_id: c.user_id as string, name: c.full_name || c.email || "Closer" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { groups: groupList, entries, setters, closers };
  });

export const addB2BCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      deal_amount: z.number().nonnegative().max(100000000),
      setter_user_id: z.string().uuid().nullable().optional(),
      setter_percent: z.number().nonnegative().max(100).nullable().optional(),
      closer_user_id: z.string().uuid().nullable().optional(),
      closer_percent: z.number().nonnegative().max(100).nullable().optional(),
      note: z.string().max(2000).optional().nullable(),
    }).parse
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    type CommissionInsert = {
      user_id: string;
      role: string;
      amount: number;
      commission_percent: number;
      deal_amount: number;
      status: string;
      note: string | null;
      added_by: string;
      created_at: string;
    };
    const inserts: CommissionInsert[] = [];
    const nowIso = new Date().toISOString();
    if (data.setter_user_id && data.setter_percent != null) {
      inserts.push({
        user_id: data.setter_user_id,
        role: "setter",
        amount: Math.round(data.deal_amount * data.setter_percent) / 100,
        commission_percent: data.setter_percent,
        deal_amount: data.deal_amount,
        status: "pending",
        note: data.note ?? null,
        added_by: context.userId,
        created_at: nowIso,
      });
    }
    if (data.closer_user_id && data.closer_percent != null) {
      inserts.push({
        user_id: data.closer_user_id,
        role: "closer",
        amount: Math.round(data.deal_amount * data.closer_percent) / 100,
        commission_percent: data.closer_percent,
        deal_amount: data.deal_amount,
        status: "pending",
        note: data.note ?? null,
        added_by: context.userId,
        created_at: nowIso,
      });
    }
    if (inserts.length === 0) throw new Error("Choose a setter or a closer");
    const { error } = await context.supabase.from("commissions").insert(inserts);
    if (error) throw new Error(error.message);
    return { ok: true, count: inserts.length };
  });
