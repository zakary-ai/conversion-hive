// Pulls payment posts from the Slack #pif-dm channel and upserts them into
// public.pif_payments. Server-only.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";
export const PIF_DM_CHANNEL = "C0BR3VDKL8Z"; // #pif-dm

type SlackMessage = {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  bot_id?: string;
};

async function slackFetch(method: string, query = ""): Promise<Record<string, unknown>> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const slackKey = process.env["SLACK_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!slackKey) throw new Error("Slack is not connected");

  const res = await fetch(`${GATEWAY_URL}/${method}${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": slackKey },
  });
  const body = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`Slack ${method} returned non-JSON (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  if (!res.ok || json["ok"] !== true) {
    throw new Error(`Slack ${method} failed (HTTP ${res.status}): ${String(json["error"] ?? "unknown error")}`);
  }
  return json;
}

export type ParsedPayment = {
  person_name: string | null;
  amount_due: number | null;
  due_date: string | null; // YYYY-MM-DD
  payment_method: string | null;
  recurrence_note: string | null;
  needs_review: boolean;
  paid_in_full: boolean;
};

const MONEY = String.raw`\$?\s*([\d][\d,]*(?:\.\d{1,2})?)\s*\$?`;

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Pick the year that puts month/day closest to the posting date. */
function resolveDate(month: number, day: number, year: number | null, postedAt: Date): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let y = year;
  if (y == null) {
    const base = postedAt.getUTCFullYear();
    const candidates = [base - 1, base, base + 1];
    let best = base;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const diff = Math.abs(Date.UTC(c, month - 1, day) - postedAt.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    y = best;
  } else if (y < 100) {
    y += 2000;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function parsePaymentText(text: string, postedAt: Date): ParsedPayment {
  const clean = text.replace(/\s+/g, " ").trim();

  // Name: everything before the first dash/amount marker.
  let person_name: string | null = null;
  const nameMatch = clean.match(/^([A-Za-z][A-Za-z.'\-\s]{1,60}?)\s*(?:[-–—:]|\$|\d)/);
  if (nameMatch?.[1]) person_name = nameMatch[1].trim().replace(/[\s-]+$/, "");
  if (person_name) {
    person_name = person_name
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Amount + date due, e.g. "(200 due on 10/9)" or "325 due 10/4".
  let amount_due: number | null = null;
  let due_date: string | null = null;
  const dueOn = clean.match(new RegExp(`${MONEY}\\s*(?:is\\s*)?due\\s*(?:on\\s*)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?`, "i"));
  if (dueOn) {
    amount_due = toNumber(dueOn[1]!);
    due_date = resolveDate(Number(dueOn[2]), Number(dueOn[3]), dueOn[4] ? Number(dueOn[4]) : null, postedAt);
  } else {
    const dateFirst = clean.match(new RegExp(`due\\s*(?:on\\s*)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?[^\\d$]{0,12}${MONEY}`, "i"));
    if (dateFirst) {
      due_date = resolveDate(Number(dateFirst[1]), Number(dateFirst[2]), dateFirst[3] ? Number(dateFirst[3]) : null, postedAt);
      amount_due = toNumber(dateFirst[4]!);
    } else {
      const dateOnly = clean.match(/due\s*(?:on\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
      if (dateOnly) {
        due_date = resolveDate(Number(dateOnly[1]), Number(dateOnly[2]), dateOnly[3] ? Number(dateOnly[3]) : null, postedAt);
      }
    }
  }

  // Remaining-balance parenthetical, e.g. "(450 remaining upon commissions)".
  const paren = clean.match(/\(([^)]{3,160})\)/);
  const parenText = paren?.[1]?.trim() ?? null;

  // Recurring arrangements, e.g. "$100 due every 2 weeks til paid off".
  let recurrence_note: string | null = null;
  const RECUR = /\b(?:every\s+(?:\d+|a|one|two|three|four|other)?\s*(?:week|weeks|month|months|day|days)|weekly|bi-?weekly|monthly)\b/i;
  if (parenText && RECUR.test(parenText)) recurrence_note = parenText;
  if (!recurrence_note && RECUR.test(clean)) {
    const m = clean.match(new RegExp(`([^().]*${RECUR.source}[^().]*)`, "i"));
    if (m?.[1]) recurrence_note = m[1].trim();
  }
  if (!recurrence_note && parenText && /commis?sions|remaining|left|pending|within|when he|when she|as he|as she|gets paid/i.test(parenText)) {
    recurrence_note = parenText;
  }
  if (amount_due == null && parenText) {
    const amt = parenText.match(new RegExp(MONEY, "i"));
    if (amt) amount_due = toNumber(amt[1]!);
  }
  if (recurrence_note && amount_due == null) {
    const amt = recurrence_note.match(new RegExp(MONEY, "i"));
    if (amt) amount_due = toNumber(amt[1]!);
  }

  // Payment method.
  let payment_method: string | null = null;
  const pm = clean.match(/payment\s*method\s*[-–:]*\s*([A-Za-z ]{3,20})/i);
  if (pm?.[1]) payment_method = pm[1].trim();
  if (!payment_method) {
    const tag = clean.match(/#(zelle|venmo|cashapp|cash\s?app|paypal|stripe|apple\s?pay|card)/i);
    if (tag?.[1]) payment_method = tag[1];
    else {
      const bare = clean.match(/\b(zelle|venmo|cashapp|cash app|paypal|stripe|apple pay)\b/i);
      if (bare?.[1]) payment_method = bare[1];
    }
  }
  if (payment_method) {
    payment_method = payment_method.charAt(0).toUpperCase() + payment_method.slice(1).toLowerCase();
  }

  // A single amount with no remainder or "down" wording means paid in full.
  const paidInFull =
    amount_due == null &&
    due_date == null &&
    recurrence_note == null &&
    parenText == null &&
    !/\bdown\b|\bremaining\b|\bleft\b|\bdue\b/i.test(clean);

  const needs_review = !person_name || (!paidInFull && due_date == null && recurrence_note == null);

  return {
    person_name,
    amount_due,
    due_date,
    payment_method,
    recurrence_note: recurrence_note ?? (paidInFull ? "Paid in full" : null),
    needs_review,
  };
}

/** True when the message looks like a payment post rather than chatter. */
function looksLikePayment(text: string): boolean {
  if (!text.trim()) return false;
  return /\$|\bdue\b|\bpif\b|\bdown\b|payment method/i.test(text);
}

export type SyncResult = { messages: number; created: number; updated: number; skipped: number };

export async function syncPifPayments(limit = 200): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const messages: SlackMessage[] = [];
  let cursor = "";
  do {
    const page = await slackFetch(
      "conversations.history",
      `channel=${PIF_DM_CHANNEL}&limit=100${cursor ? `&cursor=${cursor}` : ""}`,
    );
    messages.push(...((page["messages"] as SlackMessage[]) ?? []));
    cursor = ((page["response_metadata"] as { next_cursor?: string } | undefined)?.next_cursor ?? "") as string;
  } while (cursor && messages.length < limit);

  const { data: existingRows } = await supabaseAdmin
    .from("pif_payments")
    .select("id, slack_ts, manually_edited, status")
    .eq("slack_channel", PIF_DM_CHANNEL);
  const existing = new Map((existingRows ?? []).map((r) => [r.slack_ts, r]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of messages) {
    const text = m.text ?? "";
    if (m.subtype || !looksLikePayment(text)) {
      skipped++;
      continue;
    }
    const postedAt = new Date(Number(m.ts.split(".")[0]) * 1000);
    const parsed = parsePaymentText(text, postedAt);
    const prior = existing.get(m.ts);

    if (prior?.manually_edited) {
      // Never overwrite hand-corrected rows; only refresh the raw text.
      await supabaseAdmin.from("pif_payments").update({ raw_text: text }).eq("id", prior.id);
      skipped++;
      continue;
    }

    const row = {
      slack_channel: PIF_DM_CHANNEL,
      slack_ts: m.ts,
      slack_user: m.user ?? null,
      posted_at: postedAt.toISOString(),
      raw_text: text,
      ...parsed,
    };

    if (prior) {
      const { error } = await supabaseAdmin.from("pif_payments").update(row).eq("id", prior.id);
      if (!error) updated++;
    } else {
      const { error } = await supabaseAdmin.from("pif_payments").insert(row);
      if (!error) created++;
    }
  }

  await supabaseAdmin
    .from("pif_payment_sync")
    .update({
      last_synced_at: new Date().toISOString(),
      last_status: "ok",
      last_error: null,
      messages_seen: messages.length,
    })
    .eq("id", 1);

  return { messages: messages.length, created, updated, skipped };
}

export async function recordSyncFailure(message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("pif_payment_sync")
    .update({ last_synced_at: new Date().toISOString(), last_status: "error", last_error: message })
    .eq("id", 1);
}
