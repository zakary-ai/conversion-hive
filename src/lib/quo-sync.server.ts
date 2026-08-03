// Pulls call activity straight from Quo (OpenPhone) into `call_logs`.
//
// Quo's `/v1/calls` endpoint requires the external participant number, so we
// discover participants by paging `/v1/conversations` for each workspace
// number, then fetch the calls for each participant. Recording / transcript /
// summary artifacts are patched in afterwards for rows still missing them.

type QuoPhoneNumber = { id: string; number?: string; name?: string | null };
type QuoConversation = { id: string; participants?: string[]; lastActivityAt?: string; phoneNumberId?: string };
type QuoCall = {
  id: string;
  direction?: string;
  status?: string;
  duration?: number;
  createdAt?: string;
  answeredAt?: string | null;
  completedAt?: string | null;
  participants?: string[];
  phoneNumberId?: string;
};

type Dialogue = { identifier?: string; userId?: string; content?: string; text?: string };

const API = "https://api.quo.com";

function digits10(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "").slice(-10);
}

async function quoGet<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: apiKey } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmtTranscript(o: { dialogue?: Dialogue[]; text?: string; transcript?: string } | null | undefined): string | null {
  if (!o) return null;
  if (Array.isArray(o.dialogue) && o.dialogue.length > 0) {
    return o.dialogue
      .map((d) => `${d.identifier || d.userId || "Speaker"}: ${d.content || d.text || ""}`.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (typeof o.transcript === "string") return o.transcript;
  if (typeof o.text === "string") return o.text;
  return null;
}

function fmtSummary(o: { summary?: string | string[]; nextSteps?: string[] } | null | undefined): string | null {
  if (!o) return null;
  const parts: string[] = [];
  if (Array.isArray(o.summary)) parts.push(o.summary.join("\n"));
  else if (typeof o.summary === "string") parts.push(o.summary);
  if (Array.isArray(o.nextSteps) && o.nextSteps.length > 0) {
    parts.push("Next steps:\n- " + o.nextSteps.join("\n- "));
  }
  return parts.length ? parts.join("\n\n") : null;
}

export type QuoSyncOptions = {
  /** ISO timestamp — only calls created at/after this are synced. */
  sinceIso: string;
  /** Restrict the sync to a single workspace number (E.164). */
  onlyNumberE164?: string | null;
  /** Cap conversation pages per workspace number (50 conversations per page). */
  maxConversationPages?: number;
  /** Cap artifact (recording/transcript/summary) lookups per run. */
  maxArtifacts?: number;
};

export type QuoSyncResult = {
  numbers: number;
  conversations: number;
  callsSeen: number;
  inserted: number;
  adopted: number;
  updated: number;
  artifacts: number;
};

export async function syncQuoCalls(opts: QuoSyncOptions): Promise<QuoSyncResult> {
  const apiKey = process.env.OPENPHONE_API_KEY;
  if (!apiKey) throw new Error("OPENPHONE_API_KEY is not configured");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sinceMs = new Date(opts.sinceIso).getTime();
  const maxPages = opts.maxConversationPages ?? 8;
  const maxArtifacts = opts.maxArtifacts ?? 40;

  const result: QuoSyncResult = {
    numbers: 0, conversations: 0, callsSeen: 0, inserted: 0, adopted: 0, updated: 0, artifacts: 0,
  };

  // ---- number -> setter attribution map (Quo's own assignments win)
  const { fetchQuoPhoneNumbers, buildQuoOwnerMap } = await import("@/lib/quo-numbers.server");
  const allNumbers = await fetchQuoPhoneNumbers(apiKey);
  const owner = await buildQuoOwnerMap(supabaseAdmin as never, allNumbers);

  // ---- workspace numbers
  let numbers: QuoPhoneNumber[] = allNumbers;
  const onlyDigits = opts.onlyNumberE164 ? digits10(opts.onlyNumberE164) : null;
  if (onlyDigits) numbers = numbers.filter((n) => digits10(n.number) === onlyDigits);
  // only numbers we can attribute to a setter
  numbers = numbers.filter((n) => owner.has(digits10(n.number)));
  result.numbers = numbers.length;


  for (const num of numbers) {
    const workspaceE164 = num.number ?? "";
    const userId = owner.get(digits10(workspaceE164));
    if (!userId) continue;

    // ---- page conversations until we pass the window
    const participants = new Set<string>();
    let pageToken: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const q = new URLSearchParams({ phoneNumber: workspaceE164, maxResults: "50" });
      if (pageToken) q.set("pageToken", pageToken);
      const convRes = await quoGet<{ data?: QuoConversation[]; nextPageToken?: string | null }>(
        `/v1/conversations?${q.toString()}`, apiKey,
      );
      const rows = convRes?.data ?? [];
      if (rows.length === 0) break;
      result.conversations += rows.length;
      let passedWindow = false;
      for (const c of rows) {
        const t = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0;
        if (t && t < sinceMs) { passedWindow = true; continue; }
        for (const p of c.participants ?? []) if (p) participants.add(p);
      }
      pageToken = convRes?.nextPageToken ?? null;
      if (passedWindow || !pageToken) break;
    }

    // ---- calls per participant
    for (const participant of participants) {
      const q = new URLSearchParams({ phoneNumberId: num.id, maxResults: "10" });
      q.append("participants[]", participant);
      const callsRes = await quoGet<{ data?: QuoCall[] }>(`/v1/calls?${q.toString()}`, apiKey);
      const calls = (callsRes?.data ?? []).filter((c) => {
        const t = c.createdAt ? new Date(c.createdAt).getTime() : 0;
        return !t || t >= sinceMs;
      });
      result.callsSeen += calls.length;

      for (const call of calls) {
        const inbound = (call.direction ?? "").startsWith("in");
        const externalDigits = digits10(participant);
        const patch = {
          direction: call.direction ?? (inbound ? "incoming" : "outgoing"),
          status: call.status ?? null,
          from_number: inbound ? participant : workspaceE164,
          to_number: inbound ? workspaceE164 : participant,
          duration_sec: typeof call.duration === "number" ? call.duration : null,
          started_at: call.answeredAt || call.createdAt || null,
          ended_at: call.completedAt || null,
        };

        const { data: existing } = await supabaseAdmin
          .from("call_logs").select("id").eq("openphone_call_id", call.id).maybeSingle();

        if (existing) {
          await supabaseAdmin.from("call_logs").update(patch).eq("id", existing.id);
          result.updated++;
          continue;
        }

        // adopt an in-app dial row for the same external number
        let adoptedId: string | null = null;
        if (externalDigits) {
          const windowStart = new Date((call.createdAt ? new Date(call.createdAt).getTime() : Date.now()) - 6 * 3600_000).toISOString();
          const { data: candidates } = await supabaseAdmin
            .from("call_logs")
            .select("id, to_number")
            .is("openphone_call_id", null)
            .eq("user_id", userId)
            .gte("started_at", windowStart)
            .order("started_at", { ascending: false })
            .limit(25);
          const match = (candidates ?? []).find((c) => digits10(c.to_number) === externalDigits);
          if (match) adoptedId = match.id;
        }

        if (adoptedId) {
          await supabaseAdmin
            .from("call_logs")
            .update({ ...patch, openphone_call_id: call.id })
            .eq("id", adoptedId);
          result.adopted++;
        } else {
          // link to a claimed pool lead / lead with the same number when possible
          let leadId: string | null = null;
          let poolLeadId: string | null = null;
          if (externalDigits) {
            const { data: pl } = await supabaseAdmin
              .from("b2b_lead_pool")
              .select("id, phone")
              .eq("claimed_by", userId)
              .ilike("phone", `%${externalDigits}%`)
              .limit(1);
            if (pl && pl.length > 0) poolLeadId = pl[0].id;
            if (!poolLeadId) {
              const { data: ld } = await supabaseAdmin
                .from("leads")
                .select("id, phone")
                .eq("assigned_user_id", userId)
                .ilike("phone", `%${externalDigits}%`)
                .limit(1);
              if (ld && ld.length > 0) leadId = ld[0].id;
            }
          }
          await supabaseAdmin.from("call_logs").insert({
            ...patch,
            openphone_call_id: call.id,
            user_id: userId,
            lead_id: leadId,
            pool_lead_id: poolLeadId,
          } as never);
          result.inserted++;
        }
      }
    }
  }

  // ---- artifacts for rows still missing them
  let artifactQuery = supabaseAdmin
    .from("call_logs")
    .select("id, openphone_call_id, recording_url, transcript, summary")
    .not("openphone_call_id", "is", null)
    .is("recording_url", null)
    .gte("started_at", opts.sinceIso)
    .order("started_at", { ascending: false })
    .limit(maxArtifacts);
  if (onlyDigits) {
    const uid = owner.get(onlyDigits);
    if (uid) artifactQuery = artifactQuery.eq("user_id", uid);
  }
  const { data: needArtifacts } = await artifactQuery;

  for (const row of needArtifacts ?? []) {
    const callId = row.openphone_call_id!;
    const patch: { recording_url?: string; transcript?: string; transcript_status?: string; summary?: string } = {};

    const rec = await quoGet<{ data?: Array<{ url?: string; media?: Array<{ url?: string }> }> }>(
      `/v1/call-recordings/${encodeURIComponent(callId)}`, apiKey,
    );
    const recUrl = rec?.data?.[0]?.url || rec?.data?.[0]?.media?.[0]?.url;
    if (recUrl) patch.recording_url = recUrl;

    if (!row.transcript) {
      const tx = await quoGet<{ data?: { status?: string; dialogue?: Dialogue[]; text?: string; transcript?: string } }>(
        `/v1/call-transcripts/${encodeURIComponent(callId)}`, apiKey,
      );
      if (tx?.data) {
        const t = fmtTranscript(tx.data);
        if (t) patch.transcript = t;
        if (tx.data.status) patch.transcript_status = tx.data.status;
      }
    }

    if (!row.summary) {
      const sum = await quoGet<{ data?: { summary?: string | string[]; nextSteps?: string[] } }>(
        `/v1/call-summaries/${encodeURIComponent(callId)}`, apiKey,
      );
      if (sum?.data) {
        const s = fmtSummary(sum.data);
        if (s) patch.summary = s;
      }
    }

    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("call_logs").update(patch).eq("id", row.id);
      result.artifacts++;
    }
  }

  return result;
}
