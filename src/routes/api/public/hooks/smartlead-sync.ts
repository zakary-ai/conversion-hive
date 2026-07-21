import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";

type ObMessageDirection = Database["public"]["Enums"]["ob_message_direction"];
type ObCampaignChannel = Database["public"]["Enums"]["ob_campaign_channel"];
type ObLeadStatus = Database["public"]["Enums"]["ob_lead_status"];

// Smartlead polling sync — runs every ~2 min via pg_cron.
// Pulls new replies for each active email campaign and upserts them into
// ob_leads / ob_conversations / ob_messages. Acts as the primary path;
// the Smartlead webhook stays wired as backup.

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t || null;
}

function asDate(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  if (typeof v === "number") return String(v);
  return null;
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

type SyncSummary = {
  campaign_id: string;
  smartlead_campaign_id: string;
  new_messages: number;
  error?: string;
};

async function syncCampaign(
  supabaseAdmin: any,
  apiKey: string,
  campaign: {
    id: string;
    smartlead_campaign_id: string;
    setter_id: string | null;
    channel: ObCampaignChannel;
    last_synced_at: string | null;
  },
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    campaign_id: campaign.id,
    smartlead_campaign_id: campaign.smartlead_campaign_id,
    new_messages: 0,
  };
  // Widen slightly to make sure we don't miss a boundary reply. Dedupe by smartlead_message_id.
  const lookback = campaign.last_synced_at
    ? new Date(new Date(campaign.last_synced_at).getTime() - 5 * 60_000).toISOString()
    : new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  // Smartlead: list leads for campaign, then pull message-history for those with recent replies.
  // Use /campaigns/{id}/leads?limit=100&offset=N with pagination.
  const newSyncedAt = new Date().toISOString();

  try {
    let offset = 0;
    const pageSize = 100;
    const maxPages = 20; // safety
    for (let page = 0; page < maxPages; page++) {
      const url = `${SMARTLEAD_BASE}/campaigns/${encodeURIComponent(campaign.smartlead_campaign_id)}/leads?api_key=${encodeURIComponent(apiKey)}&limit=${pageSize}&offset=${offset}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        summary.error = `leads list ${res.status}`;
        break;
      }
      const json = (await res.json()) as any;
      const rows: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.leads) ? json.leads : [];
      if (!rows.length) break;

      for (const row of rows) {
        // Try to detect a "has reply" flag / last reply time
        const lead = row.lead || row;
        const lastReplyRaw = row.last_reply_time || row.reply_time || lead?.last_reply_time || null;
        const replyCount = Number(row.reply_count ?? row.replies ?? lead?.reply_count ?? 0);
        const hasReply = replyCount > 0 || !!lastReplyRaw;
        if (!hasReply) continue;
        const lastReply = asDate(lastReplyRaw);
        // Skip if we've already synced past this reply time.
        if (lastReply && lastReply < lookback) continue;

        const slLeadId = asString(row.lead_id ?? row.id ?? lead?.id);
        if (!slLeadId) continue;
        const leadEmail = normalizeEmail(row.email ?? lead?.email);
        if (!leadEmail) continue;

        // Fetch message history for this lead.
        const historyUrl = `${SMARTLEAD_BASE}/leads/${encodeURIComponent(slLeadId)}/message-history?campaign_id=${encodeURIComponent(campaign.smartlead_campaign_id)}&api_key=${encodeURIComponent(apiKey)}`;
        const histRes = await fetch(historyUrl, { headers: { Accept: "application/json" } });
        if (!histRes.ok) continue;
        const histJson = (await histRes.json()) as any;
        const history: any[] = Array.isArray(histJson) ? histJson : Array.isArray(histJson?.history) ? histJson.history : Array.isArray(histJson?.data) ? histJson.data : [];
        if (!history.length) continue;

        // Ensure ob_lead exists (create shell if not).
        let leadInternalId: string | null = null;
        {
          const { data: existingByEmail } = await supabaseAdmin
            .from("ob_leads")
            .select("id, owner_setter_id")
            .eq("email", leadEmail)
            .maybeSingle();
          if (existingByEmail?.id) {
            leadInternalId = existingByEmail.id as string;
            // Backfill ownership if missing
            if (!existingByEmail.owner_setter_id && campaign.setter_id) {
              await supabaseAdmin.from("ob_leads").update({ owner_setter_id: campaign.setter_id }).eq("id", leadInternalId);
            }
          } else {
            const first = asString(row.first_name ?? lead?.first_name);
            const last = asString(row.last_name ?? lead?.last_name);
            const { data: created } = await supabaseAdmin
              .from("ob_leads")
              .insert({
                email: leadEmail,
                first_name: first,
                last_name: last,
                phone: asString(row.phone ?? lead?.phone),
                linkedin_url: asString(row.linkedin_url ?? lead?.linkedin_url),
                status: "replied" as ObLeadStatus,
                owner_setter_id: campaign.setter_id,
                source: "smartlead_sync",
              })
              .select("id")
              .single();
            leadInternalId = created?.id ?? null;
          }
        }
        if (!leadInternalId) continue;

        // Ensure conversation.
        let conversationId: string | null = null;
        {
          const { data: existing } = await supabaseAdmin
            .from("ob_conversations")
            .select("id")
            .eq("lead_id", leadInternalId)
            .eq("channel", campaign.channel)
            .maybeSingle();
          conversationId = existing?.id ?? null;
          if (!conversationId) {
            const { data: created } = await supabaseAdmin
              .from("ob_conversations")
              .insert({
                lead_id: leadInternalId,
                channel: campaign.channel,
                category: "uncategorized",
                needs_response: false,
              })
              .select("id")
              .single();
            conversationId = created?.id ?? null;
          }
        }
        if (!conversationId) continue;

        // Determine setter mailbox emails (best-effort — from history rows).
        // Insert missing messages, dedupe by smartlead_message_id.
        let lastInbound: string | null = null;
        let lastOutbound: string | null = null;
        for (const m of history) {
          const type = (asString(m.type) || asString(m.email_type) || "").toUpperCase();
          const isReply = type === "REPLY" || m.direction === "inbound" || m.is_reply === true;
          const isSent = type === "SENT" || m.direction === "outbound" || (!isReply && (m.email_body || m.body));
          if (!isReply && !isSent) continue;

          const smartleadMessageId = asString(m.message_id ?? m.stats_id ?? m.id);
          const sentAt = asDate(m.time ?? m.sent_time ?? m.reply_time ?? m.created_at) || new Date().toISOString();
          const bodyHtml = asString(m.email_body ?? m.body ?? m.html);
          const bodyText = asString(m.email_body_text ?? m.body_text ?? m.text) || stripHtml(bodyHtml);
          const subject = asString(m.subject);
          const from = normalizeEmail(m.from ?? m.from_email);
          const to = normalizeEmail(m.to ?? m.to_email);

          // Dedupe.
          if (smartleadMessageId) {
            const { data: dupe } = await supabaseAdmin
              .from("ob_messages")
              .select("id")
              .eq("smartlead_message_id", smartleadMessageId)
              .maybeSingle();
            if (dupe?.id) continue;
          } else {
            // Fallback dedupe: same conversation + sent_at + direction
            const { data: dupe } = await supabaseAdmin
              .from("ob_messages")
              .select("id")
              .eq("conversation_id", conversationId)
              .eq("sent_at", sentAt)
              .eq("direction", isReply ? "inbound" : "outbound")
              .maybeSingle();
            if (dupe?.id) continue;
          }

          await supabaseAdmin.from("ob_messages").insert({
            conversation_id: conversationId,
            direction: (isReply ? "inbound" : "outbound") as ObMessageDirection,
            from_email: isReply ? (from || leadEmail) : (from || null),
            to_email: isReply ? (to || null) : (to || leadEmail),
            subject,
            body_html: bodyHtml,
            body_text: bodyText,
            sent_at: sentAt,
            smartlead_message_id: smartleadMessageId,
          });
          summary.new_messages++;

          if (isReply) {
            if (!lastInbound || sentAt > lastInbound) lastInbound = sentAt;
          } else {
            if (!lastOutbound || sentAt > lastOutbound) lastOutbound = sentAt;
          }
        }

        if (lastInbound || lastOutbound) {
          const upd: Record<string, unknown> = {};
          if (lastInbound) {
            upd.last_inbound_at = lastInbound;
            upd.needs_response = true;
          }
          if (lastOutbound) upd.last_outbound_at = lastOutbound;
          await supabaseAdmin.from("ob_conversations").update(upd).eq("id", conversationId);
        }
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
  }

  // Advance the campaign's sync watermark even on partial failure so we don't
  // hammer the same window forever; lookback window covers small gaps.
  await supabaseAdmin
    .from("ob_campaigns")
    .update({ last_synced_at: newSyncedAt })
    .eq("id", campaign.id);

  return summary;
}

export const Route = createFileRoute("/api/public/hooks/smartlead-sync")({
  server: {
    handlers: {
      POST: async () => {
        const apiKey = process.env.SMARTLEAD_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "SMARTLEAD_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: campaigns, error } = await supabaseAdmin
          .from("ob_campaigns")
          .select("id, smartlead_campaign_id, setter_id, channel, last_synced_at, status")
          .eq("channel", "email")
          .not("smartlead_campaign_id", "is", null)
          .in("status", ["active", "paused"]);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: SyncSummary[] = [];
        for (const c of campaigns || []) {
          if (!c.smartlead_campaign_id) continue;
          const summary = await syncCampaign(
            supabaseAdmin as any,
            apiKey,
            {
              id: c.id as string,
              smartlead_campaign_id: c.smartlead_campaign_id as string,
              setter_id: (c.setter_id as string | null) ?? null,
              channel: c.channel as ObCampaignChannel,
              last_synced_at: (c.last_synced_at as string | null) ?? null,
            },
          );
          results.push(summary);
        }

        const totalNew = results.reduce((a, r) => a + r.new_messages, 0);
        return new Response(
          JSON.stringify({ ok: true, campaigns: results.length, new_messages: totalNew, results }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
