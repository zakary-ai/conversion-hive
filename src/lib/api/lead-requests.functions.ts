import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Setter requests more leads. Creates an unread notification for every admin.
export const requestMoreLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull setter profile (name + quota) for the message.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, email, daily_lead_quota")
      .eq("user_id", context.userId)
      .maybeSingle();
    const setterName =
      ((profile?.full_name as string | null) ?? null) ||
      ((profile?.email as string | null) ?? null) ||
      "A setter";
    const quota = ((profile as { daily_lead_quota?: number } | null)?.daily_lead_quota as number) ?? 75;

    // Block duplicate open requests from the same setter within last hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("type", "lead_request")
      .is("read_at", null)
      .gte("created_at", oneHourAgo)
      .filter("data->>requester_user_id", "eq", context.userId)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: true, duplicate: true };
    }

    // Find all admins.
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (adminRoles ?? []).map((r) => r.user_id as string);
    if (adminIds.length === 0) {
      throw new Error("No admins available to approve");
    }

    const rows = adminIds.map((uid) => ({
      user_id: uid,
      type: "lead_request",
      title: `${setterName} requested more leads`,
      body: `Approve to send ${quota} more leads.`,
      link: "/app/admin",
      data: {
        requester_user_id: context.userId,
        requester_name: setterName,
        requested_count: quota,
      },
    }));
    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

// Admin approves a lead request: assigns N leads to the setter, marks
// notification read, and notifies the setter.
export const approveLeadRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ notification_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (!isAdmin || isAdmin.length === 0) throw new Error("Forbidden");

    const { data: notif, error: nErr } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, data, type")
      .eq("id", data.notification_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (nErr) throw new Error(nErr.message);
    if (!notif || notif.type !== "lead_request") throw new Error("Request not found");

    const payload = (notif.data ?? {}) as {
      requester_user_id?: string;
      requested_count?: number;
      requester_name?: string;
    };
    const requesterId = payload.requester_user_id;
    if (!requesterId) throw new Error("Invalid request payload");
    const count = Math.max(1, Math.min(500, payload.requested_count ?? 75));

    // Assign N unassigned New leads to the requester.
    const { data: pool, error: pErr } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("status", "New")
      .eq("retired", false)
      .eq("do_not_contact", false)
      .is("assigned_user_id", null)
      .order("created_at", { ascending: true })
      .limit(count);
    if (pErr) throw new Error(pErr.message);
    const ids = (pool ?? []).map((r) => r.id as string);
    let assigned = 0;
    if (ids.length > 0) {
      const { error: aErr } = await supabaseAdmin
        .from("leads")
        .update({ assigned_user_id: requesterId })
        .in("id", ids);
      if (aErr) throw new Error(aErr.message);
      assigned = ids.length;
    }

    // Mark this admin's notification read so the popup closes.
    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notif.id);

    // Also mark the parallel request rows for other admins as read.
    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("type", "lead_request")
      .is("read_at", null)
      .filter("data->>requester_user_id", "eq", requesterId);

    // Notify the setter.
    await supabaseAdmin.from("notifications").insert({
      user_id: requesterId,
      type: "leads_approved",
      title:
        assigned > 0
          ? `${assigned} new leads added`
          : "Lead request approved",
      body:
        assigned > 0
          ? `An admin sent you ${assigned} more leads.`
          : "No unassigned leads were available right now.",
      link: "/app/leads",
      data: { assigned, requested: count },
    });

    return { ok: true, assigned, requested: count };
  });

// Admin dismisses a lead request without assigning leads.
export const dismissLeadRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ notification_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (!isAdmin || isAdmin.length === 0) throw new Error("Forbidden");

    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notification_id)
      .eq("user_id", context.userId);
    return { ok: true };
  });
