import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import type { Database } from "@/integrations/supabase/types";

type ObLeadStatus = Database["public"]["Enums"]["ob_lead_status"];
type ObConversationCategory = Database["public"]["Enums"]["ob_conversation_category"];
type ObCampaignStatus = Database["public"]["Enums"]["ob_campaign_status"];
type ObMessageDirection = Database["public"]["Enums"]["ob_message_direction"];
type ObActivityType = Database["public"]["Enums"]["ob_activity_type"];
type ObSuppressionReason = Database["public"]["Enums"]["ob_suppression_reason"];
type ObMembershipStatus = Database["public"]["Enums"]["ob_membership_status"];
type ObCampaignChannel = Database["public"]["Enums"]["ob_campaign_channel"];

// Smartlead webhook receiver.
// Configure in Smartlead → Settings → Webhooks → add this URL with events:
//   Email Sent, First Email Sent, Email Open, Email Link Click, Email Reply,
//   Lead Unsubscribed, Lead Category Updated, Email Bounce, Campaign Status Changed,
//   Manual Step Reached, Manual Reply Sent, Untracked Replies
// Smartlead signs requests with HMAC-SHA256 of the raw body in the header
// `x-smartlead-signature` (or `smartlead-signature`).

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expected = `sha256=${expectedHex}`;
  const provided = header.trim().toLowerCase();
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)) {
      return true;
    }

    const providedHex = provided.startsWith("sha256=") ? provided.slice("sha256=".length) : provided;
    const providedHexBuffer = Buffer.from(providedHex);
    const expectedHexBuffer = Buffer.from(expectedHex);
    return providedHexBuffer.length === expectedHexBuffer.length && timingSafeEqual(providedHexBuffer, expectedHexBuffer);
  } catch {
    return false;
  }
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function asDate(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (typeof value === "number") return String(value);
  return null;
}

function normalizeEventType(event: unknown): string | null {
  if (typeof event !== "string") return null;
  return event.trim().toLowerCase().replace(/\s+/g, "_");
}

type SmartleadPayload = {
  event_type?: string;
  type?: string;
  event?: string;
  id?: string;
  event_id?: string;
  external_event_id?: string;
  lead_id?: string | number;
  lead_email?: string;
  email?: string;
  from_email?: string;
  to_email?: string;
  sender_email?: string;
  recipient_email?: string;
  reply_email?: string;
  campaign_id?: string | number;
  message_id?: string | number;
  thread_id?: string;
  conversation_id?: string;
  subject?: string;
  email_subject?: string;
  body?: string;
  body_html?: string;
  body_text?: string;
  reply_body?: string;
  preview_text?: string;
  reply_plaintext?: string;
  reply_html?: string;
  reply_text?: string;
  stats_id?: string | number;
  email_stats_id?: string | number;
  leadMap?: string | number;
  lead_name?: string;
  first_name?: string;
  last_name?: string;
  to_name?: string;
  sent_time?: string;
  received_time?: string;
  created_at?: string;
  sent_at?: string;
  received_at?: string;
  time_replied?: string;
  timestamp?: string | number;
  category?: string;
  lead_category?: string;
  status?: string;
  campaign_status?: string;
  lead_status?: string;
  link_url?: string;
  clicked_link?: string;
  step_number?: number;
  step?: number;
  unsubscribed?: boolean;
  bounce?: boolean;
  bounced?: boolean;
  [key: string]: unknown;
};

function extractPayload(raw: string): SmartleadPayload {
  try {
    return JSON.parse(raw) as SmartleadPayload;
  } catch {
    return {};
  }
}

function getEventId(payload: SmartleadPayload): string | null {
  return asString(payload.id || payload.event_id || payload.external_event_id || payload.message_id || payload.thread_id);
}

function getEventType(payload: SmartleadPayload): string | null {
  return normalizeEventType(payload.event_type || payload.type || payload.event);
}

function getLeadEmail(payload: SmartleadPayload): string | null {
  return normalizeEmail(
    (payload as any).sl_lead_email || payload.lead_email || payload.email || payload.reply_email || payload.recipient_email || payload.to_email,
  );
}

function getLeadEmailForEvent(payload: SmartleadPayload, eventType: string): string | null {
  if (["email_reply", "manual_reply_sent", "untracked_replies"].includes(eventType)) {
    // For reply events, Smartlead's payload is oriented from OUR mailbox's POV:
    //   from_email = our mailbox, to_email/sl_lead_email = the lead.
    return normalizeEmail(
      (payload as any).sl_lead_email || payload.lead_email || payload.email || payload.reply_email || payload.to_email || payload.recipient_email,
    );
  }
  return getLeadEmail(payload);
}

function getSenderEmail(payload: SmartleadPayload): string | null {
  return normalizeEmail(payload.from_email || payload.sender_email);
}

function getSenderEmailForEvent(payload: SmartleadPayload, eventType: string): string | null {
  if (["email_reply", "manual_reply_sent", "untracked_replies"].includes(eventType)) {
    // Our mailbox = from_email on Smartlead reply payloads.
    return normalizeEmail(payload.from_email || payload.sender_email);
  }
  return getSenderEmail(payload);
}


function getCampaignId(payload: SmartleadPayload): string | null {
  const id = payload.campaign_id;
  if (id === null || id === undefined) return null;
  return String(id);
}

function getMessageId(payload: SmartleadPayload): string | null {
  const id = payload.message_id;
  if (id === null || id === undefined) return null;
  return String(id);
}

function getStatsId(payload: SmartleadPayload): string | null {
  return asString(payload.stats_id || payload.email_stats_id);
}

function getThreadId(payload: SmartleadPayload): string | null {
  return asString((payload as any).stats_thread_id || (payload as any).sl_email_lead_map_id || payload.thread_id || payload.conversation_id);
}


function getSubject(payload: SmartleadPayload): string | null {
  return asString(payload.subject || payload.email_subject);
}

function getBodyHtml(payload: SmartleadPayload): string | null {
  return asString(payload.body_html || payload.reply_html || payload.reply_body || payload.body);
}

function getBodyText(payload: SmartleadPayload): string | null {
  return asString(payload.reply_plaintext || payload.reply_text || payload.preview_text || payload.body_text || payload.reply_body || payload.body);
}

function getSentAt(payload: SmartleadPayload): string | null {
  return asDate(payload.sent_time || payload.sent_at || payload.created_at || payload.timestamp);
}

function getReceivedAt(payload: SmartleadPayload): string | null {
  return asDate(payload.received_time || payload.received_at || payload.time_replied || payload.timestamp);
}

function getCategory(payload: SmartleadPayload): string | null {
  const cat = asString(payload.category || payload.lead_category);
  return cat ? cat.toLowerCase().replace(/\s+/g, "_") : null;
}

function splitName(name: unknown): { firstName: string | null; lastName: string | null } {
  if (typeof name !== "string") return { firstName: null, lastName: null };
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

function getLeadStatus(payload: SmartleadPayload): string | null {
  return asString(payload.lead_status || payload.status);
}

function getCampaignStatus(payload: SmartleadPayload): string | null {
  return asString(payload.campaign_status || payload.status);
}

function getLinkUrl(payload: SmartleadPayload): string | null {
  return asString(payload.link_url || payload.clicked_link);
}

function parseLeadStatus(value: string | null): ObLeadStatus | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const allowed: ObLeadStatus[] = [
    "new", "queued", "in_sequence", "replied", "positive", "meeting_booked", "discovery_scheduled",
    "not_interested", "unsubscribed", "disqualified", "closed",
  ];
  return allowed.includes(normalized as ObLeadStatus) ? (normalized as ObLeadStatus) : null;
}

function parseConversationCategory(value: string | null): ObConversationCategory | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const allowed: ObConversationCategory[] = [
    "uncategorized", "positive", "question", "objection", "info_requested", "out_of_office",
    "not_interested", "wrong_person", "unsubscribe", "meeting_booked",
  ];
  return allowed.includes(normalized as ObConversationCategory) ? (normalized as ObConversationCategory) : null;
}

function parseCampaignStatus(value: string | null): ObCampaignStatus | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const allowed: ObCampaignStatus[] = ["active", "paused", "completed"];
  return allowed.includes(normalized as ObCampaignStatus) ? (normalized as ObCampaignStatus) : null;
}

function parseSuppressionReason(value: string | null): ObSuppressionReason | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const allowed: ObSuppressionReason[] = ["unsubscribed", "complained", "bounced", "customer", "do_not_contact", "manual"];
  return allowed.includes(normalized as ObSuppressionReason) ? (normalized as ObSuppressionReason) : null;
}

function categoryToLeadStatus(category: string | null): ObLeadStatus | null {
  if (!category) return null;
  const map: Record<string, ObLeadStatus> = {
    positive: "positive",
    question: "replied",
    objection: "replied",
    info_requested: "replied",
    out_of_office: "replied",
    not_interested: "not_interested",
    wrong_person: "disqualified",
    unsubscribe: "unsubscribed",
    meeting_booked: "meeting_booked",
  };
  return map[category] || null;
}

function mapReplyCategory(category: string | null): ObConversationCategory {
  return parseConversationCategory(category) || "uncategorized";
}

export const Route = createFileRoute("/api/public/webhooks/smartlead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = process.env.SMARTLEAD_WEBHOOK_SECRET;
        const sig =
          request.headers.get("x-smartlead-signature") ||
          request.headers.get("smartlead-signature") ||
          request.headers.get("x-smartlead-sig");
        // Only verify when both a secret is configured AND Smartlead actually sent a header.
        // Smartlead's per-campaign webhooks don't always sign, so unsigned requests are accepted.
        const signatureValid = secret && sig ? verifySignature(raw, sig, secret) : true;

        const payload = extractPayload(raw);
        const eventType = getEventType(payload);

        // Always log the incoming request for debugging — even bad signatures / unknown events.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const debugNow = new Date().toISOString();
        await supabaseAdmin.from("ob_webhook_events").insert({
          source: "smartlead",
          event_type: eventType || "unknown",
          external_event_id: getEventId(payload),
          payload: payload as unknown as never,
          processed: false,
          error: !signatureValid ? `invalid_signature (header=${sig ? "present" : "missing"})` : (!eventType ? "missing_event_type" : null),
          received_at: debugNow,
        });

        if (!signatureValid) {
          return new Response("Invalid signature", { status: 401 });
        }
        if (!eventType) {
          return new Response("Missing event type", { status: 400 });
        }
        const eventId = getEventId(payload);
        const leadEmail = getLeadEmailForEvent(payload, eventType);
        const senderEmail = getSenderEmailForEvent(payload, eventType);
        const campaignId = getCampaignId(payload);
        const messageId = getMessageId(payload);
        const statsId = getStatsId(payload);
        const threadId = getThreadId(payload);
        const now = new Date().toISOString();


        // Find the matching campaign and lead by external IDs / email.
        let campaignInternalId: string | null = null;
        let campaignSetterId: string | null = null;
        let leadInternalId: string | null = null;

        if (campaignId) {
          const { data: campaign } = await supabaseAdmin
            .from("ob_campaigns")
            .select("id, setter_id")
            .eq("smartlead_campaign_id", campaignId)
            .maybeSingle();
          campaignInternalId = campaign?.id ?? null;
          campaignSetterId = campaign?.setter_id ?? null;
        }

        if (leadEmail) {
          const { data: lead } = await supabaseAdmin
            .from("ob_leads")
            .select("id, owner_setter_id, status")
            .eq("email", leadEmail)
            .maybeSingle();
          leadInternalId = lead?.id ?? null;
          if (leadInternalId && !lead?.owner_setter_id && campaignSetterId) {
            await supabaseAdmin
              .from("ob_leads")
              .update({ owner_setter_id: campaignSetterId, updated_at: now })
              .eq("id", leadInternalId);
          }
        }

        if (!leadInternalId && eventType.startsWith("lead")) {
          if (campaignId && campaignInternalId) {
            const { data: membership } = await supabaseAdmin
              .from("ob_campaign_memberships")
              .select("lead_id")
              .eq("campaign_id", campaignInternalId)
              .eq("smartlead_lead_id", String(payload.lead_id ?? ""))
              .maybeSingle();
            if (membership) leadInternalId = membership.lead_id;
          }
        }

        if (!leadInternalId && leadEmail && campaignSetterId) {
          const explicitName = splitName(payload.lead_name || `${asString(payload.first_name) || ""} ${asString(payload.last_name) || ""}`);
          const fallbackName = splitName(payload.to_name);
          const { data: createdLead } = await supabaseAdmin
            .from("ob_leads")
            .insert({
              first_name: explicitName.firstName || fallbackName.firstName,
              last_name: explicitName.lastName || fallbackName.lastName,
              email: leadEmail,
              status: "replied" as ObLeadStatus,
              owner_setter_id: campaignSetterId,
              source: "smartlead_webhook",
            })
            .select("id")
            .single();
          leadInternalId = createdLead?.id ?? null;
        }

        if (campaignInternalId && leadInternalId) {
          await supabaseAdmin.from("ob_campaign_memberships").upsert(
            {
              lead_id: leadInternalId,
              campaign_id: campaignInternalId,
              status: "active" as ObMembershipStatus,
              smartlead_lead_id: payload.lead_id ? String(payload.lead_id) : asString(payload.leadMap),
            },
            { onConflict: "lead_id, campaign_id" },
          );
        }

        async function ensureConversation(channel: ObCampaignChannel, identifier: string | null): Promise<string | null> {
          if (!leadInternalId) return null;
          let conversationId: string | null = null;
          if (identifier) {
            const { data: existing } = await supabaseAdmin
              .from("ob_conversations")
              .select("id")
              .eq("lead_id", leadInternalId)
              .eq("smartlead_thread_identifier", identifier)
              .maybeSingle();
            conversationId = existing?.id ?? null;
          }
          if (!conversationId) {
            const { data: existing } = await supabaseAdmin
              .from("ob_conversations")
              .select("id")
              .eq("lead_id", leadInternalId)
              .eq("channel", channel)
              .maybeSingle();
            conversationId = existing?.id ?? null;
          }
          if (!conversationId) {
            const { data: created } = await supabaseAdmin
              .from("ob_conversations")
              .insert({
                lead_id: leadInternalId,
                channel,
                smartlead_thread_identifier: identifier,
                category: "uncategorized",
                needs_response: false,
              })
              .select("id")
              .single();
            conversationId = created?.id ?? null;
          }
          return conversationId;
        }

        async function updateLeadStatus(status: ObLeadStatus, category?: string | null) {
          if (!leadInternalId) return;
          const update: { status?: ObLeadStatus; updated_at: string } = { updated_at: now };
          if (parseLeadStatus(status)) update.status = status;
          await supabaseAdmin.from("ob_leads").update(update).eq("id", leadInternalId);

          if (category) {
            const conversationId = await ensureConversation("email", threadId);
            if (conversationId) {
              await supabaseAdmin
                .from("ob_conversations")
                .update({ category: mapReplyCategory(category) })
                .eq("id", conversationId);
            }
          }
        }

        async function recordActivity(type: ObActivityType, detail: string | null) {
          if (!leadInternalId) return;
          await supabaseAdmin.from("ob_outreach_activities").insert({
            lead_id: leadInternalId,
            setter_id: null,
            type,
            detail: detail,
            occurred_at: now,
          });
        }

        try {
          switch (eventType) {
            case "email_sent":
            case "first_email_sent": {
              const sentAt = getSentAt(payload) || now;
              const conversationId = await ensureConversation("email", threadId);
              if (conversationId) {
                await supabaseAdmin.from("ob_messages").insert({
                  conversation_id: conversationId,
                  direction: "outbound" as ObMessageDirection,
                  from_email: senderEmail,
                  to_email: leadEmail,
                  subject: getSubject(payload),
                  body_html: getBodyHtml(payload),
                  body_text: getBodyText(payload),
                  sent_at: sentAt,
                  smartlead_message_id: messageId,
                  smartlead_stats_id: statsId,
                });
                await supabaseAdmin
                  .from("ob_conversations")
                  .update({ last_outbound_at: sentAt })
                  .eq("id", conversationId);
              }
              if (leadInternalId) {
                await supabaseAdmin
                  .from("ob_leads")
                  .update({ status: "in_sequence", updated_at: now })
                  .eq("id", leadInternalId);
              }
              if (campaignInternalId && leadInternalId) {
                await supabaseAdmin.from("ob_campaign_memberships").upsert(
                  {
                    lead_id: leadInternalId,
                    campaign_id: campaignInternalId,
                    status: "active" as ObMembershipStatus,
                    smartlead_lead_id: payload.lead_id ? String(payload.lead_id) : null,
                  },
                  { onConflict: "lead_id, campaign_id" },
                );
              }
              await recordActivity("email_sent", `Step ${asString(payload.step_number || payload.step) || "unknown"}: ${getSubject(payload) || "no subject"}`);
              break;
            }

            case "email_open": {
              await recordActivity("email_sent", `Email opened${messageId ? ` (message ${messageId})` : ""}`);
              break;
            }

            case "email_link_click": {
              await recordActivity("email_sent", `Link clicked: ${getLinkUrl(payload) || "unknown link"}`);
              break;
            }

            case "email_reply":
            case "manual_reply_sent": {
              const receivedAt = getReceivedAt(payload) || now;
              const category = getCategory(payload);
              const conversationId = await ensureConversation("email", threadId);
              if (conversationId) {
                await supabaseAdmin.from("ob_messages").insert({
                  conversation_id: conversationId,
                  direction: "inbound" as ObMessageDirection,
                  from_email: leadEmail,
                  to_email: senderEmail,
                  subject: getSubject(payload),
                  body_html: getBodyHtml(payload),
                  body_text: getBodyText(payload),
                  sent_at: receivedAt,
                  smartlead_message_id: messageId,
                  smartlead_stats_id: statsId,
                });
                await supabaseAdmin
                  .from("ob_conversations")
                  .update({
                    last_inbound_at: receivedAt,
                    needs_response: true,
                    category: mapReplyCategory(category),
                  })
                  .eq("id", conversationId);
              }
              const leadStatus = categoryToLeadStatus(category) || "replied";
              await updateLeadStatus(leadStatus, category);
              await recordActivity("email_reply", `Replied: ${getBodyText(payload)?.slice(0, 200) || "reply received"}`);
              break;
            }

            case "lead_unsubscribed": {
              await updateLeadStatus("unsubscribed", "unsubscribe");
              await recordActivity("note", "Lead unsubscribed via email");
              if (leadEmail) {
                await supabaseAdmin.from("ob_suppression_list").upsert(
                  { email: leadEmail, reason: "unsubscribed" as ObSuppressionReason },
                  { onConflict: "email" },
                );
              }
              break;
            }

            case "lead_category_updated": {
              const category = getCategory(payload);
              const leadStatus = categoryToLeadStatus(category);
              await updateLeadStatus(leadStatus || "replied", category);
              await recordActivity("status_change", `Category updated: ${category || "unknown"}`);
              break;
            }

            case "email_bounce": {
              await updateLeadStatus("disqualified", null);
              await recordActivity("note", "Email bounced");
              if (leadEmail) {
                await supabaseAdmin.from("ob_suppression_list").upsert(
                  { email: leadEmail, reason: "bounced" as ObSuppressionReason },
                  { onConflict: "email" },
                );
              }
              break;
            }

            case "campaign_status_changed": {
              const status = parseCampaignStatus(getCampaignStatus(payload));
              if (campaignInternalId && status) {
                await supabaseAdmin
                  .from("ob_campaigns")
                  .update({ status: status, updated_at: now })
                  .eq("id", campaignInternalId);
              }
              break;
            }

            case "manual_step_reached": {
              await recordActivity("note", `Manual step reached${payload.step_number ? ` (step ${payload.step_number})` : ""}`);
              break;
            }

            case "untracked_replies": {
              const receivedAt = getReceivedAt(payload) || now;
              const conversationId = await ensureConversation("email", threadId);
              if (conversationId) {
                await supabaseAdmin.from("ob_messages").insert({
                  conversation_id: conversationId,
                  direction: "inbound" as ObMessageDirection,
                  from_email: leadEmail,
                  to_email: senderEmail,
                  subject: getSubject(payload),
                  body_html: getBodyHtml(payload),
                  body_text: getBodyText(payload),
                  sent_at: receivedAt,
                  smartlead_message_id: messageId,
                  smartlead_stats_id: statsId,
                });
                await supabaseAdmin
                  .from("ob_conversations")
                  .update({ last_inbound_at: receivedAt, needs_response: true })
                  .eq("id", conversationId);
              }
              await updateLeadStatus("replied", null);
              await recordActivity("email_reply", "Untracked reply received");
              break;
            }

            default: {
              // Unknown event type: already stored in ob_webhook_events.
              break;
            }
          }

          if (eventId) {
            await supabaseAdmin
              .from("ob_webhook_events")
              .update({ processed: true })
              .eq("source", "smartlead")
              .eq("external_event_id", eventId);
          }
        } catch (processingError) {
          console.error("smartlead webhook processing error", processingError);
          const errorText = (processingError as Error).message || "processing error";
          if (eventId) {
            await supabaseAdmin
              .from("ob_webhook_events")
              .update({ error: errorText })
              .eq("source", "smartlead")
              .eq("external_event_id", eventId);
          }
          return Response.json({ ok: true, processed: false, error: errorText });
        }

        return Response.json({ ok: true, processed: true });
      },
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST Smartlead webhook events here",
          supported_events: [
            "email_sent",
            "first_email_sent",
            "email_open",
            "email_link_click",
            "email_reply",
            "lead_unsubscribed",
            "lead_category_updated",
            "email_bounce",
            "campaign_status_changed",
            "manual_step_reached",
            "manual_reply_sent",
            "untracked_replies",
          ],
        }),
    },
  },
});
