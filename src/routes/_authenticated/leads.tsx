import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listMyLeads, updateLead, createAppointment } from "@/lib/api/cl.functions";
import { PageHeader, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Phone, Mail, CalendarClock, CheckCircle2, XCircle, PhoneOff } from "lucide-react";
import { toast } from "sonner";

const opts = queryOptions({ queryKey: ["my-leads"], queryFn: () => listMyLeads() });
const STATUSES = ["New","Contacted","No Answer","Interested","Booked","Not Interested","Follow Up","Call Again","Call Back"] as const;
type Lead = Awaited<ReturnType<typeof listMyLeads>>[number];

export const Route = createFileRoute("/_authenticated/leads")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: LeadsPage,
});

function LeadsPage() {
  const { data: leads } = useSuspenseQuery(opts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
              <a
                href={`tel:${l.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                aria-label={`Call ${l.name}`}
              >
                <Phone className="h-5 w-5" />
              </a>
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

      <LeadDrawer lead={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);

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

  return (
    <>
      <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {lead && (
            <>
              <SheetHeader>
                <SheetTitle>{lead.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-5 mt-6">
                <div className="space-y-2 text-sm">
                  {lead.company && <div className="text-muted-foreground">{lead.company}</div>}
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-primary font-medium">
                      <Phone className="h-4 w-4" />{lead.phone}
                    </a>
                  )}
                  {lead.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{lead.email}</div>}
                  {lead.source && <div className="text-xs text-muted-foreground">Source: {lead.source}</div>}
                  <div className="pt-1"><StatusPill status={lead.status} /></div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Set outcome</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => setBookOpen(true)} className="h-12 bg-success text-success-foreground hover:bg-success/90">
                      <CheckCircle2 className="h-4 w-4" /> Book
                    </Button>
                    <Button onClick={handleNoPickup} variant="outline" className="h-12">
                      <PhoneOff className="h-4 w-4" /> No Pickup
                    </Button>
                    <Button onClick={handleNotInterested} variant="outline" className="h-12 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                      <XCircle className="h-4 w-4" /> Not Interested
                    </Button>
                    <Button onClick={() => setCallbackOpen(true)} variant="outline" className="h-12">
                      <CalendarClock className="h-4 w-4" /> Call Back
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Notes</label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1" />
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => mut.mutate({ id: lead.id, notes })}>
                    Save notes
                  </Button>
                </div>

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
        </SheetContent>
      </Sheet>

      {lead && (
        <>
          <BookingDialog lead={lead} open={bookOpen} onClose={() => setBookOpen(false)} onDone={() => { setBookOpen(false); onClose(); invalidate(); }} />
          <CallbackDialog lead={lead} open={callbackOpen} onClose={() => setCallbackOpen(false)} onDone={() => { setCallbackOpen(false); onClose(); invalidate(); }} />
        </>
      )}
    </>
  );
}

function BookingDialog({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(lead.name ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [context, setContext] = useState("");
  const [when, setWhen] = useState(defaultDateTime());

  useEffect(() => {
    if (open) {
      setName(lead.name ?? ""); setPhone(lead.phone ?? ""); setEmail(lead.email ?? "");
      setContext(""); setWhen(defaultDateTime());
    }
  }, [open, lead.id]);

  const submit = useMutation({
    mutationFn: async () => {
      await createAppointment({ data: {
        lead_id: lead.id, type: "booking",
        scheduled_at: new Date(when).toISOString(),
        name, phone: phone || null, email: email || null, context: context || null,
      }});
      await updateLead({ data: { id: lead.id, status: "Booked", contacted: true } });
    },
    onSuccess: () => { toast.success("Appointment booked"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Book appointment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Date & time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
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
  const [when, setWhen] = useState(defaultDateTime());
  const [note, setNote] = useState("");

  useEffect(() => { if (open) { setWhen(defaultDateTime()); setNote(""); } }, [open]);

  const submit = useMutation({
    mutationFn: async () => {
      const iso = new Date(when).toISOString();
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
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Schedule a callback</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Call back at"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Note (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!when || submit.isPending}>Schedule</Button>
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
  // format yyyy-MM-ddTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
