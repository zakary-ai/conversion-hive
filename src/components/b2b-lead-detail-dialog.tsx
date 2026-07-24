import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Phone, Mail, Building2, Linkedin, MapPin, PhoneCall, Save } from "lucide-react";
import { listCallsForPoolLead, startBridgeCall } from "@/lib/api/calls.functions";
import { updatePoolLeadNotes } from "@/lib/api/b2b-pool.functions";
import { toast } from "sonner";

function normalizeE164(input: string): string {
  const t = input.trim();
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/\D/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return "+" + d;
}

async function callViaQuo(poolLeadId: string, phone: string) {
  const to = normalizeE164(phone);
  startBridgeCall({ data: { pool_lead_id: poolLeadId } }).catch(() => {});
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    const deep = `openphone://call?to=${encodeURIComponent(to)}`;
    const fallback = `tel:${to}`;
    const timer = setTimeout(() => { window.location.href = fallback; }, 1200);
    const onHide = () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onHide); };
    document.addEventListener("visibilitychange", onHide);
    window.location.href = deep;
  } else {
    const url = `https://my.openphone.com/inbox?dial=${encodeURIComponent(to)}`;
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) toast.error("Popup blocked — allow popups to open Quo");
  }
}

export function B2bLeadDetailDialog({
  lead, onClose, onLogOutcome, showActions = true, extraHeader,
}: {
  lead: any | null;
  onClose: () => void;
  onLogOutcome?: () => void;
  showActions?: boolean;
  extraHeader?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(lead?.notes ?? ""); }, [lead?.id, lead?.notes]);

  const calls = useQuery({
    queryKey: ["pool-lead-calls", lead?.id],
    queryFn: () => listCallsForPoolLead({ data: { pool_lead_id: lead!.id } }),
    enabled: !!lead?.id,
  });

  const saveNotes = useMutation({
    mutationFn: () => updatePoolLeadNotes({ data: { id: lead.id, notes } }),
    onSuccess: () => {
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
      qc.invalidateQueries({ queryKey: ["admin-pool"] });
      qc.invalidateQueries({ queryKey: ["admin-pool-lead", lead.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead"}
                <Badge variant="outline">{lead.status}</Badge>
                {lead.didnt_pick_up && <Badge variant="secondary">Didn't pick up</Badge>}
              </DialogTitle>
              {extraHeader}
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <Field icon={<Building2 className="h-4 w-4" />} label="Company" value={lead.company} />
              <Field label="Title" value={lead.title} />
              <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={lead.phone} />
              <Field icon={<Mail className="h-4 w-4" />} label="Email" value={lead.email} />
              <Field label="Website" value={lead.website}
                render={(v) => <a onClick={(e) => e.stopPropagation()} href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{v} <ExternalLink className="h-3 w-3" /></a>}
              />
              <Field icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" value={lead.linkedin_url}
                render={(v) => <a onClick={(e) => e.stopPropagation()} href={/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open profile <ExternalLink className="h-3 w-3" /></a>}
              />
              <Field icon={<MapPin className="h-4 w-4" />} label="Location" value={[lead.city, lead.state].filter(Boolean).join(", ") || null} />
              <Field label="Industry" value={lead.industry} />
              <Field label="Segment" value={lead.segment} />
              <Field label="Lead type" value={lead.lead_type} />
              <Field label="Company size" value={lead.company_size} />
              <Field label="Email status" value={lead.email_status} />
            </div>

            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Notes</div>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write a note about this lead…" />
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="outline" disabled={saveNotes.isPending || notes === (lead.notes ?? "")} onClick={() => saveNotes.mutate()}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save notes
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Call history</div>
              {calls.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading calls…</div>
              ) : !calls.data?.length ? (
                <div className="text-sm text-muted-foreground">No calls logged yet.</div>
              ) : (
                <div className="space-y-3">
                  {calls.data.map((c: any) => (
                    <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{new Date(c.started_at ?? c.created_at).toLocaleString()}</span>
                        <div className="flex items-center gap-2">
                          {c.status && <Badge variant="outline">{c.status}</Badge>}
                          {typeof c.duration_sec === "number" && <span>{Math.round(c.duration_sec)}s</span>}
                        </div>
                      </div>
                      {c.recording_url ? (
                        <audio controls src={c.recording_url} className="w-full h-9" />
                      ) : (
                        <div className="text-xs text-muted-foreground italic">Recording pending…</div>
                      )}
                      {c.summary && (
                        <div>
                          <div className="text-xs font-medium mb-0.5">Summary</div>
                          <div className="text-sm whitespace-pre-wrap">{c.summary}</div>
                        </div>
                      )}
                      {c.transcript ? (
                        <details>
                          <summary className="text-xs font-medium cursor-pointer">Transcript</summary>
                          <div className="text-sm whitespace-pre-wrap mt-1 max-h-64 overflow-y-auto">{c.transcript}</div>
                        </details>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">Transcript pending…</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showActions && (
              <div className="flex justify-end gap-2 pt-4 flex-wrap">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button variant="outline" disabled={!lead.phone} onClick={() => lead.phone && callViaQuo(lead.id, lead.phone)}>
                  <PhoneCall className="h-4 w-4 mr-1" /> Call
                </Button>
                {onLogOutcome && <Button onClick={onLogOutcome}>Log call outcome</Button>}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, icon, render }: {
  label: string; value: string | null | undefined; icon?: React.ReactNode; render?: (v: string) => React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 text-sm break-words">{value ? (render ? render(value) : value) : <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
