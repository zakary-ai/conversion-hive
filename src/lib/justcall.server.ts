// JustCall REST client (v2.1). Server-only.
// Auth: `Authorization: <api_key>:<api_secret>` (JustCall's own scheme, not Bearer).

const BASE = "https://api.justcall.io/v2.1";

function authHeader(): string {
  const key = process.env["JUSTCALL_API_KEY"];
  const secret = process.env["JUSTCALL_API_SECRET"];
  if (!key || !secret) throw new Error("JustCall API credentials are not configured.");
  return `${key}:${secret}`;
}

export type JcResult<T> = { ok: boolean; status: number; data: T | null; error: string | null };

export async function jcFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<JcResult<T>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const url = `${BASE}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!res.ok) {
      const msg =
        (parsed && typeof parsed === "object" && "message" in (parsed as Record<string, unknown>)
          ? String((parsed as Record<string, unknown>).message)
          : typeof parsed === "string" ? parsed : `HTTP ${res.status}`);
      return { ok: false, status: res.status, data: null, error: msg };
    }
    return { ok: true, status: res.status, data: parsed as T, error: null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type JcAgent = { id: string; name: string; email: string | null; numbers: string[] };

type RawAgent = {
  id?: number | string;
  agent_id?: number | string;
  name?: string;
  agent_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  agent_email?: string;
  phone_numbers?: Array<{ phone_number?: string; justcall_number?: string } | string>;
};

export async function jcListAgents(): Promise<{ agents: JcAgent[]; error: string | null }> {
  const res = await jcFetch<{ data?: RawAgent[] }>("/users", { query: { per_page: 50 } });
  if (!res.ok) return { agents: [], error: res.error };
  const rows = Array.isArray(res.data?.data) ? res.data!.data! : [];
  const agents = rows.map((r) => {
    const id = String(r.id ?? r.agent_id ?? "");
    const name =
      r.name ?? r.agent_name ?? [r.first_name, r.last_name].filter(Boolean).join(" ") ?? "";
    const numbers = (r.phone_numbers ?? [])
      .map((n) => (typeof n === "string" ? n : n.phone_number ?? n.justcall_number ?? ""))
      .filter(Boolean) as string[];
    return { id, name: name || id, email: (r.email ?? r.agent_email ?? null) || null, numbers };
  });
  return { agents: agents.filter((a) => a.id), error: null };
}

export type JcCampaign = { id: string; name: string };

export async function jcListCampaigns(): Promise<{ campaigns: JcCampaign[]; error: string | null }> {
  type Row = { id?: number | string; campaign_id?: number | string; name?: string; campaign_name?: string };
  const campaigns: JcCampaign[] = [];
  // JustCall caps per_page at 50 — page through results.
  for (let page = 1; page <= 10; page++) {
    const res = await jcFetch<{ data?: Row[] }>("/sales_dialer/campaigns", {
      query: { per_page: 50, page },
    });
    if (!res.ok) return { campaigns, error: res.error };
    const rows = Array.isArray(res.data?.data) ? res.data!.data! : [];
    campaigns.push(
      ...rows
        .map((r) => ({ id: String(r.id ?? r.campaign_id ?? ""), name: String(r.name ?? r.campaign_name ?? "") }))
        .filter((c) => c.id),
    );
    if (rows.length < 50) break;
  }
  return { campaigns, error: null };
}

export async function jcCreateCampaign(
  name: string,
  agentId?: string | null,
): Promise<{ id: string | null; error: string | null }> {
  // JustCall's create-campaign payload varies by account setup; try known shapes.
  const attempts: Array<Record<string, unknown>> = [
    { name, country_code: "US", type: "predictive" },
    { name, country_code: "US" },
    { name, type: "sales_dialer" },
    { name },
  ];
  let lastError: string | null = null;
  for (const base of attempts) {
    const body = { ...base, ...(agentId ? { agent_id: agentId } : {}) };
    const res = await jcFetch<{ data?: { id?: number | string; campaign_id?: number | string } }>(
      "/sales_dialer/campaigns",
      { method: "POST", body },
    );
    if (res.ok) {
      const id = res.data?.data?.id ?? res.data?.data?.campaign_id;
      return { id: id ? String(id) : null, error: null };
    }
    lastError = res.error;
  }
  return { id: null, error: lastError };
}


export type JcContact = {
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
};

export async function jcAddContacts(
  campaignId: string,
  contacts: JcContact[],
): Promise<{ added: number; error: string | null }> {
  let added = 0;
  let error: string | null = null;
  // JustCall accepts one contact per request on the sales dialer contacts endpoint.
  for (const c of contacts) {
    const res = await jcFetch("/sales_dialer/contacts", {
      method: "POST",
      body: {
        campaign_id: campaignId,
        phone: c.phone,
        firstname: c.first_name ?? "",
        lastname: c.last_name ?? "",
        email: c.email ?? "",
        company: c.company ?? "",
        notes: c.notes ?? "",
      },
    });
    if (res.ok) added++;
    else if (!error) error = res.error;
  }
  return { added, error };
}

export async function jcClickToCall(params: {
  agentId: string;
  contactNumber: string;
  justcallNumber?: string | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const body: Record<string, unknown> = {
    agent_id: params.agentId,
    contact_number: params.contactNumber,
  };
  if (params.justcallNumber) body.justcall_number = params.justcallNumber;
  const res = await jcFetch("/calls", { method: "POST", body });
  return { ok: res.ok, error: res.error };
}

export function last10(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}

export function toE164(input: string): string {
  const t = (input ?? "").trim();
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/\D/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return "+" + d;
}
