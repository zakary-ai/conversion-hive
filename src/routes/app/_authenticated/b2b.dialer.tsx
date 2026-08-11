import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyLiveCall, listMyRecentLiveCalls, myJustcallMapping, pushLeadsToDialer,
} from "@/lib/api/justcall.functions";
import {
  getPoolLead, updatePoolLeadContact, createAndClaimPoolLead,
} from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LogCallOutcomeDialog } from "@/components/log-call-outcome-dialog";
import { CALL_SCRIPTS } from "@/lib/script-templates";
import {
  PhoneCall, PhoneIncoming, Radio, ExternalLink, Upload, Save, UserPlus, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type LiveCall = {
  id: string;
  pool_lead_id: string | null;
  phone: string | null;
  state: string;
  direction: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export const Route = createFileRoute("/app/_authenticated/b2b/dialer")({
  head: () => ({
    meta: [
      { title: "Power Dialer" },
      { name: "description", content: "Dial through your claimed leads and see the lead card the moment they answer." },
    ],
  }),
  component: DialerPage,
});

function DialerPage() {
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveCall | null>(null);

  const mapping = useQuery({ queryKey: ["justcall-mapping"], queryFn: () => myJustcallMapping() });
  const recent = useQuery({ queryKey: ["justcall-recent"], queryFn: () => listMyRecentLiveCalls(), refetchInterval: 30000 });

  // Seed from the server, then keep it fresh over Realtime (with a slow poll as a safety net).
  const seed = useQuery({ queryKey: ["justcall-live"], queryFn: () => getMyLiveCall(), refetchInterval: 8000 });
  useEffect(() => {
    if (seed.data) setLive(seed.data as LiveCall);
  }, [seed.data]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      channel = supabase
        .channel("b2b-live-calls")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "b2b_live_calls", filter: `setter_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as LiveCall | undefined;
            if (!row) return;
            setLive(row);
            qc.invalidateQueries({ queryKey: ["justcall-recent"] });
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  const isActive = live && live.state !== "completed";

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader
        title="Power Dialer"
        description="Dial in JustCall — the lead card pops here the moment someone picks up."
      />

      {!mapping.isLoading && !mapping.data?.connected && (
        <Card className="p-4 border-warning/40">
          <div className="text-sm">
            Your JustCall agent isn't linked yet. Ask an admin to map your account on the
            JustCall setup page — until then calls won't pop a lead card.
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Session</div>
            <Button asChild className="w-full">
              <a href="https://app.justcall.io/app/sales-dialer" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Open JustCall dialer
              </a>
            </Button>
            <PushButton />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radio className={`h-3.5 w-3.5 ${isActive ? "text-success animate-pulse" : ""}`} />
              {isActive ? `Live call — ${live!.state}` : "Waiting for a connect…"}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Recent connects</div>
            {!recent.data?.length ? (
              <div className="text-sm text-muted-foreground">No calls yet today.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {recent.data.map((c: LiveCall) => (
                  <button
                    key={c.id}
                    onClick={() => setLive(c)}
                    className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-muted/30"
                  >
                    <div className="text-sm">{c.phone || "Unknown number"}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{new Date(c.started_at).toLocaleTimeString()}</span>
                      <Badge variant="outline" className="text-[10px]">{c.state}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {!live ? (
            <IdleCard />
          ) : (
            <LiveLeadCard call={live} />
          )}
          <ScriptCard />
        </div>
      </div>
    </div>
  );
}

function IdleCard() {
  return (
    <Card className="p-10 text-center">
      <PhoneIncoming className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <div className="font-display text-lg">Waiting for connect…</div>
      <div className="text-sm text-muted-foreground mt-1">
        Start dialing in JustCall. As soon as a lead picks up, everything you need shows up right here.
      </div>
    </Card>
  );
}

function PushButton() {
  const [busy, setBusy] = useState(false);
  const push = async () => {
    setBusy(true);
    try {
      const res = await pushLeadsToDialer({ data: { all_claimed: true } });
      if (res.error) toast.warning(`Pushed ${res.pushed}. JustCall said: ${res.error}`);
      else toast.success(`Pushed ${res.pushed} lead${res.pushed === 1 ? "" : "s"} to ${res.campaign ?? "your dialer"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" className="w-full" disabled={busy} onClick={push}>
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
      Push my leads to dialer
    </Button>
  );
}

function LiveLeadCard({ call }: { call: LiveCall }) {
  const qc = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const lead = useQuery({
    queryKey: ["pool-lead", call.pool_lead_id],
    queryFn: () => getPoolLead({ data: { id: call.pool_lead_id! } }),
    enabled: !!call.pool_lead_id,
  });

  const l = lead.data?.lead as any | undefined;
  useEffect(() => {
    setEmail(l?.email ?? "");
    setNotes(l?.notes ?? "");
  }, [l?.id, l?.email, l?.notes]);

  const save = useMutation({
    mutationFn: () => updatePoolLeadContact({ data: { id: l.id, email: email.trim() || null, notes } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["pool-lead", call.pool_lead_id] });
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const claimUnknown = useMutation({
    mutationFn: () => createAndClaimPoolLead({ data: { phone: call.phone ?? "" } }),
    onSuccess: () => {
      toast.success("Lead created and claimed");
      qc.invalidateQueries({ queryKey: ["justcall-live"] });
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attempts = lead.data?.attempts ?? [];

  if (!call.pool_lead_id) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-success" />
          <span className="font-display text-lg">{call.phone || "Unknown number"}</span>
          <Badge variant="outline">{call.state}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          This number isn't in your claimed leads. Create it so you can log the outcome and book.
        </p>
        <Button disabled={!call.phone || claimUnknown.isPending} onClick={() => claimUnknown.mutate()}>
          <UserPlus className="h-4 w-4 mr-2" /> Create + claim lead
        </Button>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <PhoneCall className={`h-4 w-4 ${call.state === "answered" ? "text-success" : "text-muted-foreground"}`} />
              <span className="font-display text-xl">
                {[l?.first_name, l?.last_name].filter(Boolean).join(" ") || l?.company || call.phone || "Lead"}
              </span>
              <Badge variant="outline">{call.state}</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {[l?.title, l?.company].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <Button onClick={() => setLogOpen(true)}>Log outcome</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <Field label="Phone" value={l?.phone ?? call.phone} />
          <Field label="Location" value={[l?.city, l?.state].filter(Boolean).join(", ") || null} />
          <Field label="Industry" value={l?.industry} />
          <Field label="Company size" value={l?.company_size} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Email (capture it live)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="flex items-end">
            <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did they say?" />
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Prior attempts ({attempts.length})
          </div>
          {!attempts.length ? (
            <div className="text-sm text-muted-foreground">First time reaching this lead.</div>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {attempts.map((a: any) => (
                <div key={a.id} className="text-sm flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{a.outcome}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {new Date(a.occurred_at).toLocaleString()}
                  </span>
                  {a.note && <span className="text-xs truncate">{a.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {l && (
        <LogCallOutcomeDialog
          lead={{ id: l.id, first_name: l.first_name, last_name: l.last_name, email: email || l.email }}
          open={logOpen}
          onClose={() => setLogOpen(false)}
        />
      )}
    </>
  );
}

function ScriptCard() {
  const scripts = useMemo(() => CALL_SCRIPTS, []);
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Call script</div>
      <div className="space-y-3">
        {scripts.map((s) => (
          <div key={s.id}>
            <div className="text-sm font-medium">{s.title}</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{s.body}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm break-words">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
