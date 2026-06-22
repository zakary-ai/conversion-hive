import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listMyLeads, updateLead, createAppointment, listMyAppointments } from "@/lib/api/cl.functions";
import { startBridgeCall } from "@/lib/api/calls.functions";
import { PageHeader, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Phone, Mail, CalendarClock, CheckCircle2, XCircle, PhoneOff, Building2, Tag, Clock, Video, Ban, TrendingUp, DollarSign, MessageSquare, BookOpen, Copy, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateTimePicker } from "@/components/date-time-picker";
import { SlotPicker } from "@/components/slot-picker";
import { CALL_SCRIPTS, OBJECTIONS, SMS_TEMPLATES, fillTemplate } from "@/lib/script-templates";
import { meQueryOptions } from "@/routes/_authenticated/route";
import { toast } from "sonner";

const opts = queryOptions({ queryKey: ["my-leads"], queryFn: () => listMyLeads() });
const STATUSES = ["New","Contacted","No Answer","Interested","Booked","Not Interested","Follow Up","Call Again","Call Back"] as const;
type Lead = Awaited<ReturnType<typeof listMyLeads>>[number];

export const Route = createFileRoute("/app/_authenticated/leads")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: LeadsPage,
});

function LeadsPage() {
  const { data: leads } = useSuspenseQuery(opts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("New");
  const [open, setOpen] = useState<Lead | null>(null);

  // hide do-not-contact leads from the working list
  const visibleLeads = leads.filter((l) => !l.do_not_contact);

  const filtered = visibleLeads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (l.name?.toLowerCase().includes(s) || l.company?.toLowerCase().includes(s));
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="My leads" description={`${visibleLeads.length} active · up to 75 per day`} />

      <Tabs defaultValue="leads" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="pipeline"><TrendingUp className="h-4 w-4 mr-1" /> Lead Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">No leads match.</Card>
            )}
            {filtered.map((l) => (
              <Card key={l.id} className="p-3 flex items-center justify-between gap-3" onClick={() => setOpen(l)}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.company || l.phone || l.email}</div>
                  <div className="mt-1"><StatusPill status={l.status} /></div>
                </div>
                {l.phone && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <CallButton leadId={l.id} ariaLabel={`Call ${l.name}`} onCalled={() => setOpen(l)} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Company</th>
                    <th className="text-left p-3">Contact</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Contacted</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No leads match.</td></tr>
                  )}
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setOpen(l)}>
                      <td className="p-3 font-medium">{l.name}</td>
                      <td className="p-3 text-muted-foreground">{l.company}</td>
                      <td className="p-3 text-muted-foreground">{l.phone || l.email}</td>
                      <td className="p-3"><StatusPill status={l.status} /></td>
                      <td className="p-3 text-muted-foreground">{l.contacted_at ? new Date(l.contacted_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline">
          <LeadPipeline leads={visibleLeads} onOpenLead={setOpen} />
        </TabsContent>
      </Tabs>

      <LeadDrawer lead={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function LeadPipeline({ leads, onOpenLead }: { leads: Lead[]; onOpenLead: (l: Lead) => void }) {
  const { data: appts = [] } = useQuery({
    queryKey: ["my-appointments"],
    queryFn: () => listMyAppointments(),
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const bookings = appts.filter((a) => a.type === "booking");

  const booked = bookings.filter((a) => !a.outcome);
  const closed = bookings.filter((a) => a.outcome === "closed");
  const lost = bookings.filter((a) => a.outcome === "lost");

  const fmt = (s?: string | null) => s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  type Appt = typeof bookings[number];
  const Column = ({ title, items, tone, empty }: { title: string; items: Appt[]; tone: string; empty: string }) => (
    <div className="space-y-2">
      <div className={`flex items-center justify-between px-1`}>
        <div className="text-xs uppercase tracking-widest font-semibold">{title}</div>
        <div className={`text-xs rounded-full px-2 py-0.5 ${tone}`}>{items.length}</div>
      </div>
      {items.length === 0 ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">{empty}</Card>
      ) : items.map((a) => {
        const lead = a.lead_id ? leadById.get(a.lead_id) : undefined;
        return (
          <Card
            key={a.id}
            className={`p-3 space-y-1.5 ${lead ? "cursor-pointer hover:bg-muted/30" : ""}`}
            onClick={() => lead && onOpenLead(lead)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm truncate">{a.name}</div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">{fmt(a.scheduled_at)}</div>
            </div>
            {lead?.company && <div className="text-xs text-muted-foreground truncate">{lead.company}</div>}
            {a.outcome === "closed" && (
              <div className="flex items-center gap-1 text-xs text-success font-medium">
                <DollarSign className="h-3 w-3" />
                {a.deal_amount != null ? Number(a.deal_amount).toLocaleString(undefined, { style: "currency", currency: "USD" }) : "Closed"}
              </div>
            )}
            {a.outcome === "lost" && a.lost_reason && (
              <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words rounded bg-muted/40 p-2">
                <span className="font-medium text-foreground">Reason: </span>{a.lost_reason}
              </div>
            )}
            {a.outcome === "lost" && !a.lost_reason && (
              <div className="text-xs text-muted-foreground italic">No reason provided</div>
            )}
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Column title="Booked" items={booked} tone="bg-primary/15 text-primary" empty="No upcoming bookings" />
      <Column title="Closed" items={closed} tone="bg-success/15 text-success" empty="No closed deals yet" />
      <Column title="Lost" items={lost} tone="bg-destructive/15 text-destructive" empty="No lost deals" />
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);

  const { data: appts = [] } = useQuery({
    queryKey: ["my-appointments"],
    queryFn: () => listMyAppointments(),
    enabled: !!lead,
  });
  const leadAppts = lead ? appts.filter((a) => a.lead_id === lead.id) : [];

  useEffect(() => { if (lead) setNotes(lead.notes ?? ""); }, [lead?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-leads"] });
    qc.invalidateQueries({ queryKey: ["my-appointments"] });
    qc.invalidateQueries({ queryKey: ["all-appointments"] });
    qc.invalidateQueries({ queryKey: ["client-dashboard"] });
  };

  const mut = useMutation({
    mutationFn: (vars: { id: string; status?: string; notes?: string | null; contacted?: boolean; do_not_contact?: boolean; callback_at?: string | null }) =>
      updateLead({ data: vars as never }),
    onSuccess: () => { toast.success("Lead updated"); invalidate(); },
  });

  const handleNoPickup = () => {
    if (!lead) return;
    mut.mutate({ id: lead.id, status: "Call Again", contacted: true });
    onClose();
  };
  const handleNotInterested = () => {
    if (!lead) return;
    mut.mutate({ id: lead.id, status: "Not Interested", do_not_contact: true, contacted: true });
    onClose();
  };

  const fmt = (s?: string | null) => s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <>
      <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-lg flex-col gap-2 overflow-y-auto overflow-x-hidden rounded-lg p-3 sm:max-h-[92vh] sm:w-full sm:gap-4 sm:p-6">
          {lead && (
            <>
              <DialogHeader className="space-y-1 pr-7 text-left">
                <DialogTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                  <span className="min-w-0 truncate">{lead.name}</span>
                  <StatusPill status={lead.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="min-w-0 space-y-2 sm:space-y-5">
                {/* Full details */}
                <div className="rounded-lg border border-border divide-y divide-border text-sm">
                  <DetailRow icon={Building2} label="Company" value={lead.company || "—"} />
                  <DetailRow icon={Phone} label="Phone" value={lead.phone ? <a href={`tel:${lead.phone}`} className="text-primary font-medium">{lead.phone}</a> : "—"} />
                  <DetailRow icon={Mail} label="Email" value={
                    lead.email
                      ? lead.email
                      : <EmailInlineEdit leadId={lead.id} onSaved={invalidate} />
                  } />

                  <DetailRow icon={Tag} label="Source" value={lead.source || "—"} />
                  <DetailRow icon={Clock} label="Added" value={fmt(lead.created_at)} />
                  <DetailRow icon={CheckCircle2} label="Last contacted" value={fmt(lead.contacted_at)} />
                  <DetailRow icon={CalendarClock} label="Callback at" value={fmt(lead.callback_at)} />
                  {lead.do_not_contact && (
                    <DetailRow icon={Ban} label="Do not contact" value={<span className="text-destructive font-medium">Yes</span>} />
                  )}
                </div>

                {/* Appointment history */}
                {leadAppts.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Appointments</div>
                    <div className="max-h-24 space-y-2 overflow-y-auto sm:max-h-none">
                      {leadAppts.map((a) => (
                        <div key={a.id} className="rounded-lg border border-border p-2 text-sm">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="font-medium capitalize">{a.type}</div>
                            <div className="text-xs text-muted-foreground">{fmt(a.scheduled_at)}</div>
                          </div>
                          {a.context && <div className="text-xs text-muted-foreground mt-1">{a.context}</div>}
                          {a.meeting_url && (
                            <a href={a.meeting_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <Video className="h-3 w-3" /> Join meeting
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outcome actions */}
                <div className="space-y-2">
                  {lead.phone && (
                    <div className="flex justify-center pb-1">
                      <CallButton leadId={lead.id} variant="inline" />
                    </div>
                  )}
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Set outcome</div>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2 [&>button]:min-w-0">
                    <Button onClick={() => setBookOpen(true)} className="h-9 px-2 text-xs bg-success text-success-foreground hover:bg-success/90 sm:h-12 sm:text-sm">
                      <CheckCircle2 className="h-4 w-4" /> Book
                    </Button>
                    <Button onClick={handleNoPickup} variant="outline" className="h-9 px-2 text-xs sm:h-12 sm:text-sm">
                      <PhoneOff className="h-4 w-4" /> No Pickup
                    </Button>
                    <Button onClick={handleNotInterested} variant="outline" className="h-9 px-2 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive sm:h-12 sm:text-sm">
                      <XCircle className="h-4 w-4" /> <span className="sm:hidden">Not Int.</span><span className="hidden sm:inline">Not Interested</span>
                    </Button>
                    <Button onClick={() => setCallbackOpen(true)} variant="outline" className="h-9 px-2 text-xs sm:h-12 sm:text-sm">
                      <CalendarClock className="h-4 w-4" /> Call Back
                    </Button>
                  </div>
                </div>

                <ScriptsPanel lead={lead} />

                <SmsPanel lead={lead} />

                <details className="group">
                  <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted-foreground">Notes</summary>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-2" />
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => mut.mutate({ id: lead.id, notes })}>
                    Save notes
                  </Button>
                </details>

                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Change status manually</summary>
                  <div className="mt-2">
                    <Select value={lead.status} onValueChange={(v) => mut.mutate({ id: lead.id, status: v as typeof STATUSES[number] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </details>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {lead && (
        <>
          <BookingDialog lead={lead} open={bookOpen} onClose={() => setBookOpen(false)} onDone={() => { setBookOpen(false); onClose(); invalidate(); }} />
          <CallbackDialog lead={lead} open={callbackOpen} onClose={() => setCallbackOpen(false)} onDone={() => { setCallbackOpen(false); onClose(); invalidate(); }} />
        </>
      )}
    </>
  );
}

function CallButton({ leadId, ariaLabel, variant = "round", onCalled }: { leadId: string; ariaLabel?: string; variant?: "round" | "inline"; onCalled?: () => void }) {
  const m = useMutation({
    mutationFn: () => startBridgeCall({ data: { lead_id: leadId } }),
    onSuccess: (res) => {
      // Open the lead's outcome panel BEFORE switching to the dialer, so
      // it's waiting on screen when the setter returns from the call.
      onCalled?.();
      if (res?.dial) {
        const num = encodeURIComponent(res.dial);
        const from = res.from ? `&from=${encodeURIComponent(res.from)}` : "";
        // Quo (OpenPhone) deep link — opens the Quo app and auto-dials the lead
        // from the setter's assigned Quo number. Falls back to tel: if Quo isn't installed.
        const quoUrl = `openphone://dial?number=${num}${from}&action=call`;
        const a = document.createElement("a");
        a.href = quoUrl;
        a.click();
        // Fallback to the device dialer if Quo didn't handle the scheme
        setTimeout(() => {
          if (document.hasFocus()) {
            const t = document.createElement("a");
            t.href = `tel:${res.dial}`;
            t.click();
          }
        }, 1200);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (variant === "inline") {
    return (
      <Button onClick={() => m.mutate()} disabled={m.isPending} className="h-9 px-3 text-xs bg-primary text-primary-foreground">
        <Phone className="h-4 w-4" /> {m.isPending ? "Dialing…" : "Call"}
      </Button>
    );
  }
  return (
    <button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow disabled:opacity-60"
      aria-label={ariaLabel}
    >
      <Phone className="h-5 w-5" />
    </button>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="text-xs uppercase tracking-wider text-muted-foreground w-28 shrink-0">{label}</div>
      <div className="text-sm flex-1 min-w-0 truncate text-right">{value}</div>
    </div>
  );
}

function EmailInlineEdit({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      await updateLead({ data: { id: leadId, email: value.trim() } });
    },
    onSuccess: () => { toast.success("Email saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) save.mutate(); }}
      className="flex items-center gap-1.5 justify-end"
    >
      <Input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add email…"
        className="h-7 text-xs flex-1 min-w-0"
      />
      <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!value.trim() || save.isPending}>
        Save
      </Button>
    </form>
  );
}

function BookingDialog({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(lead.name ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [context, setContext] = useState("");
  const [when, setWhen] = useState<Date | null>(null);

  useEffect(() => {
    if (open) {
      setName(lead.name ?? ""); setPhone(lead.phone ?? ""); setEmail(lead.email ?? "");
      setContext(""); setWhen(null);
    }
  }, [open, lead.id]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!when) throw new Error("Pick a time slot");
      await createAppointment({ data: {
        lead_id: lead.id, type: "booking",
        scheduled_at: when.toISOString(),
        name, phone: phone || null, email: email || null, context: context || null,
      }});
      await updateLead({ data: { id: lead.id, status: "Booked", contacted: true } });
    },
    onSuccess: () => { toast.success("Appointment booked"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Book appointment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Pick a time"><SlotPicker value={when} onChange={setWhen} /></Field>
          <Field label="Context"><Textarea rows={3} value={context} onChange={(e) => setContext(e.target.value)} placeholder="What does the lead need?" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!name || !when || submit.isPending}>Book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CallbackDialog({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [when, setWhen] = useState<Date>(defaultDateTime());
  const [note, setNote] = useState("");

  useEffect(() => { if (open) { setWhen(defaultDateTime()); setNote(""); } }, [open]);

  const submit = useMutation({
    mutationFn: async () => {
      const iso = when.toISOString();
      await createAppointment({ data: {
        lead_id: lead.id, type: "callback", scheduled_at: iso,
        name: lead.name, phone: lead.phone, email: lead.email, context: note || null,
      }});
      await updateLead({ data: { id: lead.id, status: "Call Back", callback_at: iso, contacted: true } });
    },
    onSuccess: () => { toast.success("Callback scheduled"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Schedule a callback</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Call back at"><DateTimePicker value={when} onChange={setWhen} /></Field>
          <Field label="Note (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function defaultDateTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
}

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "xs" }) {
  const [copied, setCopied] = useState(false);
  const cls = size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2 text-xs";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cls}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copied");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Copy failed");
        }
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function ScriptsPanel({ lead }: { lead: Lead }) {
  const { data: me } = useQuery({ ...meQueryOptions });
  const setter = me?.profile?.full_name?.split(/\s+/)[0] ?? "";
  const vars = { name: lead.name, company: lead.company, setter };
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" /> Scripts & objections
      </summary>
      <div className="border-t border-border p-3">
        <Tabs defaultValue="scripts">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scripts" className="text-xs">Call scripts</TabsTrigger>
            <TabsTrigger value="objections" className="text-xs">Objections</TabsTrigger>
          </TabsList>
          <TabsContent value="scripts" className="mt-3 space-y-2">
            {CALL_SCRIPTS.map((s) => {
              const filled = fillTemplate(s.body, vars);
              return (
                <div key={s.id} className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">{s.title}</div>
                    <CopyButton text={filled} size="xs" />
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{filled}</p>
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="objections" className="mt-3 space-y-2">
            {OBJECTIONS.map((o) => {
              const filled = fillTemplate(o.response, vars);
              return (
                <div key={o.id} className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-muted-foreground">"{o.objection}"</div>
                    <CopyButton text={filled} size="xs" />
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{filled}</p>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </details>
  );
}

function SmsPanel({ lead }: { lead: Lead }) {
  const { data: me } = useQuery({ ...meQueryOptions });
  const setter = me?.profile?.full_name?.split(/\s+/)[0] ?? "";
  const [templateId, setTemplateId] = useState<string>(SMS_TEMPLATES[0].id);
  const tpl = SMS_TEMPLATES.find((t) => t.id === templateId) ?? SMS_TEMPLATES[0];
  const filled = fillTemplate(tpl.body, { name: lead.name, company: lead.company, setter });
  const [draft, setDraft] = useState(filled);
  // Reset draft whenever the template or lead changes
  useEffect(() => { setDraft(filled); }, [templateId, lead.id]);
  const smsHref = lead.phone
    ? `sms:${lead.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(draft)}`
    : null;
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> SMS follow-up
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SMS_TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {lead.phone ? `To ${lead.phone}` : "No phone on file"}
          </span>
          <div className="flex gap-1.5">
            <CopyButton text={draft} size="xs" />
            {smsHref ? (
              <Button asChild size="sm" className="h-6 px-2 text-[11px]">
                <a href={smsHref}><MessageSquare className="h-3 w-3" /> Open SMS</a>
              </Button>
            ) : (
              <Button size="sm" disabled className="h-6 px-2 text-[11px]">
                <MessageSquare className="h-3 w-3" /> Open SMS
              </Button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}


