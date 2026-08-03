// Builds the Quo workspace-number -> setter attribution map.
//
// Attribution used to depend entirely on hand-maintained columns
// (`openphone_number_pool.phone_e164`, `profiles.openphone_number_e164`),
// which drift: a setter's number gets swapped in Quo, a new number is never
// added here, or the same number is typed on two profiles (which we then have
// to drop as ambiguous). All of those silently zero out that setter's dials.
//
// The source of truth is Quo itself: every phone number lists its assigned
// users. We match those user emails to `profiles.email` and only fall back to
// the stored columns when Quo gives us nothing.

const API = "https://api.quo.com";

// The workspace owner sits on every number, so it can never identify a setter.
const WORKSPACE_ADMIN_EMAILS = new Set(["conversionlabb@gmail.com"]);

export function digits10(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "").slice(-10);
}

export type QuoPhoneNumber = {
  id: string;
  number?: string;
  name?: string | null;
  users?: Array<{ email?: string | null; role?: string | null }>;
};

export async function fetchQuoPhoneNumbers(apiKey: string): Promise<QuoPhoneNumber[]> {
  try {
    const res = await fetch(`${API}/v1/phone-numbers`, { headers: { Authorization: apiKey } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: QuoPhoneNumber[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

type AdminClient = {
  from: (t: string) => any;
};

/**
 * digits10(number) -> user_id, strongest signal last:
 *   1. profiles.openphone_number_e164 (dropped when ambiguous)
 *   2. openphone_number_pool.assigned_user_id
 *   3. Quo's own per-number user assignment matched on email
 */
export async function buildQuoOwnerMap(
  supabaseAdmin: AdminClient,
  quoNumbers: QuoPhoneNumber[],
): Promise<Map<string, string>> {
  const owner = new Map<string, string>();

  const [{ data: pool }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("openphone_number_pool").select("phone_e164, assigned_user_id"),
    supabaseAdmin.from("profiles").select("user_id, email, openphone_number_e164"),
  ]);

  const byEmail = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ user_id: string; email: string | null; openphone_number_e164: string | null }>) {
    if (p.email) byEmail.set(p.email.trim().toLowerCase(), p.user_id);
  }

  // 1. profiles column — a number typed on 2+ profiles tells us nothing.
  const counts = new Map<string, number>();
  for (const p of (profiles ?? []) as Array<{ user_id: string; openphone_number_e164: string | null }>) {
    const d = digits10(p.openphone_number_e164);
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
    owner.set(d, p.user_id);
  }
  for (const [d, n] of counts) if (n > 1) owner.delete(d);

  // 2. explicit pool assignment
  for (const p of (pool ?? []) as Array<{ phone_e164: string | null; assigned_user_id: string | null }>) {
    const d = digits10(p.phone_e164);
    if (d && p.assigned_user_id) owner.set(d, p.assigned_user_id);
  }

  // 3. Quo's own assignment (wins — it's live)
  for (const n of quoNumbers) {
    const d = digits10(n.number);
    if (!d) continue;
    const emails = (n.users ?? [])
      .map((u) => (u.email ?? "").trim().toLowerCase())
      .filter((e) => e && !WORKSPACE_ADMIN_EMAILS.has(e));
    const matched = emails.map((e) => byEmail.get(e)).filter((v): v is string => Boolean(v));
    const unique = Array.from(new Set(matched));
    if (unique.length === 1) owner.set(d, unique[0]!);
  }

  return owner;
}
