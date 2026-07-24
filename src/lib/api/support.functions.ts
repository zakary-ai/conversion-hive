import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_SIZE = 5 * 1024 * 1024;

const AttachmentSchema = z.object({
  storage_path: z.string().min(1).max(500),
  filename: z.string().min(1).max(200),
  content_type: z.string().max(120).optional().nullable(),
  size_bytes: z.number().int().positive().max(MAX_SIZE),
});

const CategorySchema = z.enum(["feedback", "suggestion", "issue", "other"]);
const StatusSchema = z.enum(["open", "awaiting_user", "resolved"]);

async function signAttachments(
  supabase: any,
  atts: Array<{ id: string; storage_path: string; filename: string; content_type: string | null; size_bytes: number }>
) {
  if (atts.length === 0) return [];
  const paths = atts.map((a) => a.storage_path);
  const { data } = await supabase.storage.from("support-uploads").createSignedUrls(paths, 60 * 60);
  const byPath = new Map<string, string>();
  (data ?? []).forEach((d: any) => { if (d?.path && d?.signedUrl) byPath.set(d.path, d.signedUrl); });
  return atts.map((a) => ({ ...a, url: byPath.get(a.storage_path) ?? null }));
}

async function notifyAdmins(supabaseAdmin: any, payload: { title: string; body: string; link: string; data: any }) {
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const rows = (admins ?? []).map((a: any) => ({
    user_id: a.user_id,
    type: "support",
    title: payload.title,
    body: payload.body,
    link: payload.link,
    data: payload.data,
  }));
  if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
}

// ---------- User: create ticket ----------
export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      category: CategorySchema,
      subject: z.string().trim().min(1).max(120),
      message: z.string().trim().min(1).max(4000),
      attachments: z.array(AttachmentSchema).max(5).optional(),
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .insert({ user_id: userId, category: data.category, subject: data.subject, status: "open" })
      .select("*")
      .single();
    if (tErr || !ticket) throw new Error(tErr?.message || "Failed to create ticket");

    const { data: msg, error: mErr } = await supabase
      .from("support_ticket_messages")
      .insert({ ticket_id: ticket.id, author_id: userId, is_admin: false, body: data.message })
      .select("*")
      .single();
    if (mErr || !msg) throw new Error(mErr?.message || "Failed to add message");

    if (data.attachments && data.attachments.length) {
      const rows = data.attachments.map((a) => ({
        message_id: msg.id,
        ticket_id: ticket.id,
        storage_path: a.storage_path,
        filename: a.filename,
        content_type: a.content_type ?? null,
        size_bytes: a.size_bytes,
      }));
      const { error: aErr } = await supabase.from("support_ticket_attachments").insert(rows);
      if (aErr) throw new Error(aErr.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, email").eq("user_id", userId).maybeSingle();
    await notifyAdmins(supabaseAdmin, {
      title: "New support ticket",
      body: `${profile?.full_name || profile?.email || "A user"}: ${ticket.subject}`,
      link: `/app/admin/tickets?id=${ticket.id}`,
      data: { ticket_id: ticket.id },
    });

    return { id: ticket.id };
  });

// ---------- User: list my tickets ----------
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Get a ticket thread (user or admin) ----------
export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ticket, error } = await supabase.from("support_tickets").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");

    const [{ data: messages }, { data: attachments }] = await Promise.all([
      supabase.from("support_ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: true }),
      supabase.from("support_ticket_attachments").select("*").eq("ticket_id", ticket.id),
    ]);

    const signed = await signAttachments(supabase, (attachments ?? []) as any);
    const byMsg = new Map<string, any[]>();
    signed.forEach((a: any) => {
      const arr = byMsg.get(a.message_id) ?? [];
      arr.push(a);
      byMsg.set(a.message_id, arr);
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const authorIds = Array.from(new Set((messages ?? []).map((m) => m.author_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, full_name, email").in("user_id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
    const pMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const { data: submitter } = await supabaseAdmin.from("profiles").select("user_id, full_name, email").eq("user_id", ticket.user_id).maybeSingle();

    return {
      ticket,
      submitter: submitter ?? null,
      messages: (messages ?? []).map((m) => ({
        ...m,
        author: pMap.get(m.author_id) ?? null,
        attachments: byMsg.get(m.id) ?? [],
      })),
    };
  });

// ---------- Reply (user or admin) ----------
export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      ticket_id: z.string().uuid(),
      body: z.string().trim().min(1).max(4000),
      attachments: z.array(AttachmentSchema).max(5).optional(),
    }).parse
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" as any });

    const { data: ticket, error: tErr } = await supabase.from("support_tickets").select("*").eq("id", data.ticket_id).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status === "resolved") throw new Error("Ticket is resolved");

    const { data: msg, error: mErr } = await supabase
      .from("support_ticket_messages")
      .insert({ ticket_id: ticket.id, author_id: userId, is_admin: !!isAdmin, body: data.body })
      .select("*")
      .single();
    if (mErr || !msg) throw new Error(mErr?.message || "Failed to reply");

    if (data.attachments && data.attachments.length) {
      const rows = data.attachments.map((a) => ({
        message_id: msg.id,
        ticket_id: ticket.id,
        storage_path: a.storage_path,
        filename: a.filename,
        content_type: a.content_type ?? null,
        size_bytes: a.size_bytes,
      }));
      const { error: aErr } = await supabase.from("support_ticket_attachments").insert(rows);
      if (aErr) throw new Error(aErr.message);
    }

    const newStatus = isAdmin ? "awaiting_user" : "open";
    await supabaseAdmin
      .from("support_tickets")
      .update({ status: newStatus, last_message_at: new Date().toISOString() })
      .eq("id", ticket.id);

    if (isAdmin) {
      await supabaseAdmin.from("notifications").insert({
        user_id: ticket.user_id,
        type: "support",
        title: "Support reply",
        body: `Admin replied to "${ticket.subject}"`,
        link: `/app/tickets?id=${ticket.id}`,
        data: { ticket_id: ticket.id },
      });
    } else {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, email").eq("user_id", userId).maybeSingle();
      await notifyAdmins(supabaseAdmin, {
        title: "Ticket reply",
        body: `${profile?.full_name || profile?.email || "User"} replied to "${ticket.subject}"`,
        link: `/app/admin/tickets?id=${ticket.id}`,
        data: { ticket_id: ticket.id },
      });
    }

    return { id: msg.id };
  });

// ---------- Admin: list ----------
export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      status: StatusSchema.optional(),
      category: CategorySchema.optional(),
      search: z.string().max(120).optional(),
    }).partial().optional().parse
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" as any });
    if (!isAdmin) throw new Error("Forbidden");

    let q = supabaseAdmin.from("support_tickets").select("*").order("last_message_at", { ascending: false });
    if (data?.status) q = q.eq("status", data.status);
    if (data?.category) q = q.eq("category", data.category);
    if (data?.search) q = q.ilike("subject", `%${data.search}%`);
    const { data: tickets, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((tickets ?? []).map((t) => t.user_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("user_id, full_name, email").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const pMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    return (tickets ?? []).map((t) => ({ ...t, submitter: pMap.get(t.user_id) ?? null }));
  });

// ---------- Admin: update status ----------
export const adminUpdateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), status: StatusSchema }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" as any });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets").update({ status: data.status }).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("notifications").insert({
      user_id: ticket.user_id,
      type: "support",
      title: "Ticket status updated",
      body: `"${ticket.subject}" is now ${data.status.replace("_", " ")}`,
      link: `/app/tickets?id=${ticket.id}`,
      data: { ticket_id: ticket.id, status: data.status },
    });
    return { ok: true };
  });

// ---------- Admin: delete ----------
export const adminDeleteTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" as any });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: atts } = await supabaseAdmin.from("support_ticket_attachments").select("storage_path").eq("ticket_id", data.id);
    const paths = (atts ?? []).map((a) => a.storage_path);
    if (paths.length) await supabaseAdmin.storage.from("support-uploads").remove(paths);
    const { error } = await supabaseAdmin.from("support_tickets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
