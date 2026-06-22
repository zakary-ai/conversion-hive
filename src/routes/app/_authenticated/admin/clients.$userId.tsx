import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getClientDetail, addCommission, setCommissionPaid, backfillSetterCallArtifacts } from "@/lib/api/cl.functions";

import { PageHeader, StatCard, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DollarSign, GraduationCap, CheckCircle2, XCircle, Clock, CalendarClock, BadgeCheck, RotateCcw, Phone, ChevronDown, Mail, Building2, Search, CalendarIcon, AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Range = "day" | "week" | "month" | "90d" | "all";

export const Route = createFileRoute("/app/_authenticated/admin/clients/$userId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.userId, "all")),
  component: SetterDetailPage,
});

const opts = (id: string, range: Range) => queryOptions({
  queryKey: ["client-detail", id, range],
  queryFn: () => getClientDetail({ data: { user_id: id, range } }),
});

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Commission = {
  id: string;
  amount: number | string;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  paid_method: string | null;
};

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

function SetterDetailPage() {
  const { userId } = Route.useParams();
  const [range, setRange] = useState<Range>("all");
  const { data } = useSuspenseQuery(opts(userId, range));
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [payTarget, setPayTarget] = useState<Commission | null>(null);

  const add = useMutation({
    mutationFn: () => addCommission({ data: { user_id: userId, amount: parseFloat(amount), note } }),
    onSuccess: () => {
      toast.success("Commission added");
      setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });

  const progress = data.totalModules ? Math.round((data.completions.length / data.totalModules) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader
        title={data.profile?.full_name || data.profile?.email || "Setter"}
        description={data.profile?.email ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <BackfillButton userId={userId} />
            <Button variant="ghost" asChild><Link to="/app/admin/clients">← All setters</Link></Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {RANGES.map((r) => (
          <Button
            key={r.id}
            size="sm"
            variant={range === r.id ? "default" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </Button>
        ))}
      </div>



      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Bookings" value={data.stats.bookings} icon={CalendarClock} />
        <StatCard label="Closed" value={data.stats.closed} icon={CheckCircle2} />
        <StatCard label="Lost" value={data.stats.lost} icon={XCircle} />
        <StatCard label="Dials" value={data.stats.dials} icon={Phone} />

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Training" value={`${progress}%`} icon={GraduationCap} />
        <StatCard label="Total earned" value={money(data.balance)} icon={DollarSign} />
        <StatCard label="Paid out" value={money(data.paid)} icon={BadgeCheck} />
        <StatCard label="Unpaid" value={money(data.unpaid)} icon={Clock} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="font-display font-semibold mb-3">Training progress</h3>
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground mt-2">{data.completions.length} of {data.totalModules} modules complete</div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-semibold mb-3">Add commission</h3>
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <Button onClick={() => add.mutate()} disabled={!amount || add.isPending} className="w-full mt-2">Add commission</Button>
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Booking history</h3>
          <span className="text-xs text-muted-foreground">{data.stats.bookings} total</span>
        </div>
        {data.stats.bookings === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No bookings yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.appointments.filter((a) => a.type === "booking").slice(0, 50).map((a) => (
              <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
                <div className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                  a.outcome === "closed" ? "bg-success/15 text-success" :
                  a.outcome === "lost" ? "bg-destructive/15 text-destructive" :
                  "bg-muted text-muted-foreground"
                )}>
                  {a.outcome === "closed" ? <CheckCircle2 className="h-4 w-4" /> :
                   a.outcome === "lost" ? <XCircle className="h-4 w-4" /> :
                   <Clock className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(a.scheduled_at)}</div>
                </div>
                <div className="text-right text-xs">
                  {a.outcome === "closed" && a.deal_amount != null && (
                    <div className="text-success font-medium">{money(Number(a.deal_amount))}</div>
                  )}
                  <div className="uppercase tracking-wider text-muted-foreground">
                    {a.outcome ?? "pending"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold">Commission history</h3>
          <div className="text-xs text-muted-foreground">
            {money(data.unpaid)} unpaid · {money(data.paid)} paid
          </div>
        </div>
        {data.commissions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No entries.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.commissions.map((c) => (
              <div key={c.id} className="p-3 flex items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.note || "—"}</div>
                  <div className="text-xs text-muted-foreground">Earned {fmtDate(c.created_at)}</div>
                  {c.paid_at && (
                    <div className="text-xs text-success mt-0.5 flex items-center gap-1">
                      <BadgeCheck className="h-3 w-3" /> Paid {fmtDate(c.paid_at)} · {c.paid_method}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className={cn("font-medium", c.paid_at ? "text-muted-foreground line-through" : "text-success")}>
                    {money(Number(c.amount))}
                  </div>
                  {c.paid_at ? (
                    <UnpayButton id={c.id} userId={userId} />
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayTarget(c as Commission)}>
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-3">Quiz scores</h3>
        {data.attempts.length === 0 ? <div className="text-sm text-muted-foreground">No attempts yet.</div> : (
          <div className="space-y-2">
            {data.attempts.slice(0, 10).map((a) => (
              <div key={a.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <span>{(a as { modules?: { title?: string } }).modules?.title ?? "Module"}</span>
                <span className="font-medium">{a.score}% · {fmtDate(a.completed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <TodaysLeadsCard
        leads={data.leads as SetterLead[]}
        calls={data.calls as CallRowItem[]}
      />

      <LeadHistoryCard
        leads={data.leads as SetterLead[]}
        calls={data.calls as CallRowItem[]}
      />

      <PayDialog
        commission={payTarget}
        userId={userId}
        onClose={() => setPayTarget(null)}
      />
    </div>
  );
}

type CallRowItem = {
  id: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  status: string | null;
  direction: string;
  to_number: string | null;
  from_number: string | null;
  recording_url: string | null;
  transcript: string | null;
  transcript_status: string | null;
  summary: string | null;
  leads?: { name?: string | null; company?: string | null } | null;
};

function CallRow({ call }: { call: CallRowItem }) {
  const [open, setOpen] = useState(false);
  const when = call.started_at || call.created_at;
  const duration = call.duration_sec
    ? `${Math.floor(call.duration_sec / 60)}m ${call.duration_sec % 60}s`
    : null;
  const hasArtifacts = !!(call.recording_url || call.transcript || call.summary);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 text-sm hover:bg-muted/30 text-left">
        <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
          <Phone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">
            {call.leads?.name || call.to_number || "Unknown"}
            {call.leads?.company && <span className="text-muted-foreground"> · {call.leads.company}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {duration && <> · {duration}</>}
            {call.status && <> · {call.status}</>}
          </div>
        </div>
        {hasArtifacts && <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-4 space-y-3">
          {call.recording_url ? (
            <audio controls preload="none" src={call.recording_url} className="w-full" />
          ) : (
            <div className="text-xs text-muted-foreground">Recording not available.</div>
          )}
          {call.summary && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Summary</div>
              <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">{call.summary}</div>
            </div>
          )}
          {call.transcript ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Transcript {call.transcript_status && call.transcript_status !== "completed" && <>· {call.transcript_status}</>}
              </div>
              <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 max-h-80 overflow-y-auto">
                {call.transcript}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Transcript not available yet.</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UnpayButton({ id, userId }: { id: string; userId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => setCommissionPaid({ data: { id, paid: false } }),
    onSuccess: () => {
      toast.success("Marked unpaid");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => m.mutate()} disabled={m.isPending}>
      <RotateCcw className="h-3 w-3 mr-1" /> Unpay
    </Button>
  );
}

const PAY_METHODS = ["Zelle", "Cash App", "Venmo", "PayPal", "Wire", "ACH", "Check", "Cash", "Other"];

function PayDialog({ commission, userId, onClose }: { commission: Commission | null; userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("Zelle");
  const [customMethod, setCustomMethod] = useState("");

  const m = useMutation({
    mutationFn: () => setCommissionPaid({
      data: {
        id: commission!.id,
        paid: true,
        paid_at: date,
        paid_method: method === "Other" ? (customMethod.trim() || "Other") : method,
      },
    }),
    onSuccess: () => {
      toast.success("Marked paid");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!commission} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Mark commission paid</DialogTitle></DialogHeader>
        {commission && (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3 text-sm">
              <div className="text-success font-semibold text-lg">{money(Number(commission.amount))}</div>
              <div className="text-xs text-muted-foreground">{commission.note || "—"}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid_at">Date paid</Label>
              <Input id="paid_at" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Payment method</Label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {method === "Other" && (
                <Input
                  placeholder="Specify method"
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  maxLength={100}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => m.mutate()} disabled={m.isPending || !date}>
                {m.isPending ? "Saving…" : "Mark paid"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BackfillButton({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => backfillSetterCallArtifacts({ data: { user_id: userId, since_days: 14 } }),
    onSuccess: (r) => {
      toast.success(`Backfilled: ${r.adopted} linked, ${r.withRec} recordings, ${r.withTx} transcripts.`);
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? "Pulling…" : "Pull recordings"}
    </Button>
  );
}

// ---------- Today's Leads + history sections ----------


type SetterLead = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  callback_at: string | null;
  last_status_change_at: string;
  do_not_contact: boolean;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function SearchPopover({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-8 w-8", value && "text-primary")}>
          <Search className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Search…"}
          className="h-8 text-sm"
        />
        {value && (
          <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs" onClick={() => onChange("")}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function matchesQuery(l: SetterLead, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    l.name.toLowerCase().includes(s) ||
    (l.company ?? "").toLowerCase().includes(s) ||
    (l.email ?? "").toLowerCase().includes(s) ||
    (l.phone ?? "").toLowerCase().includes(s) ||
    l.status.toLowerCase().includes(s)
  );
}

// A lead has a "real" call if any call_logs row for it is not a manual_outcome marker.
function leadHasRealCall(leadId: string, calls: CallRowItem[]) {
  return calls.some(
    (c) =>
      (c as { lead_id?: string | null }).lead_id === leadId &&
      c.status !== "manual_outcome",
  );
}

function NoCallBadge() {
  return (
    <span
      title="Outcome marked without an attached call"
      className="inline-flex items-center gap-1 rounded-full bg-warning/15 text-warning px-2 py-0.5 text-[10px] font-medium"
    >
      <AlertTriangle className="h-3 w-3" /> No call
    </span>
  );
}

function TodaysLeadsCard({ leads, calls }: { leads: SetterLead[]; calls: CallRowItem[] }) {
  const [tab, setTab] = useState<"uncontacted" | "contacted">("uncontacted");
  const [openLead, setOpenLead] = useState<SetterLead | null>(null);
  const [query, setQuery] = useState("");

  const todayStart = startOfDay(new Date()).getTime();
  const todayEnd = endOfDay(new Date()).getTime();

  const uncontacted = leads.filter((l) => l.status === "New" && !l.contacted_at);
  const contacted = leads.filter((l) => {
    if (l.status === "New") return false;
    const t = new Date(l.last_status_change_at).getTime();
    return t >= todayStart && t <= todayEnd;
  });

  const base = tab === "uncontacted" ? uncontacted : contacted;
  const list = base.filter((l) => matchesQuery(l, query));

  return (
    <>
      <Card className="overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold">Today's Leads ({list.length})</h3>
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 items-center rounded-lg bg-muted p-1 text-xs">
              <button
                onClick={() => setTab("uncontacted")}
                className={cn(
                  "px-3 h-6 rounded-md transition-colors",
                  tab === "uncontacted" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Uncontacted ({uncontacted.length})
              </button>
              <button
                onClick={() => setTab("contacted")}
                className={cn(
                  "px-3 h-6 rounded-md transition-colors",
                  tab === "contacted" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Contacted ({contacted.length})
              </button>
            </div>
            <SearchPopover value={query} onChange={setQuery} placeholder="Search today's leads…" />
          </div>
        </div>
        {list.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {query ? "No matches." : `No ${tab} leads today.`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Company</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-border cursor-pointer hover:bg-muted/30"
                  onClick={() => setOpenLead(l)}
                >
                  <td className="p-3 font-medium">{l.name}</td>
                  <td className="p-3 text-muted-foreground">{l.company ?? "—"}</td>
                  <td className="p-3"><div className="flex items-center gap-2 flex-wrap"><StatusPill status={l.status} />{!leadHasRealCall(l.id, calls) && <NoCallBadge />}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <SetterLeadDetailDialog
        lead={openLead}
        calls={calls}
        onClose={() => setOpenLead(null)}
      />
    </>
  );
}

function LeadHistoryCard({ leads, calls }: { leads: SetterLead[]; calls: CallRowItem[] }) {
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });
  const [calOpen, setCalOpen] = useState(false);
  const [openLead, setOpenLead] = useState<SetterLead | null>(null);
  const [query, setQuery] = useState("");

  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();

  const dayLeads = leads
    .filter((l) => {
      const t = new Date(l.last_status_change_at).getTime();
      return t >= dayStart && t <= dayEnd && l.status !== "New";
    })
    .filter((l) => matchesQuery(l, query));

  const dateLabel = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <Card className="overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold">Lead history ({dayLeads.length})</h3>
          <div className="flex items-center gap-2">
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                  <CalendarIcon className="h-3.5 w-3.5" /> {dateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) {
                      setDate(d);
                      setCalOpen(false);
                    }
                  }}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <SearchPopover value={query} onChange={setQuery} placeholder="Search history…" />
          </div>
        </div>
        {dayLeads.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {query ? "No matches." : "No leads worked on this day."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Company</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {dayLeads.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-border cursor-pointer hover:bg-muted/30"
                  onClick={() => setOpenLead(l)}
                >
                  <td className="p-3 font-medium">{l.name}</td>
                  <td className="p-3 text-muted-foreground">{l.company ?? "—"}</td>
                  <td className="p-3"><div className="flex items-center gap-2 flex-wrap"><StatusPill status={l.status} />{!leadHasRealCall(l.id, calls) && <NoCallBadge />}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <SetterLeadDetailDialog
        lead={openLead}
        calls={calls}
        onClose={() => setOpenLead(null)}
      />
    </>
  );
}

function SetterLeadDetailDialog({
  lead,
  calls,
  onClose,
}: {
  lead: SetterLead | null;
  calls: CallRowItem[];
  onClose: () => void;
}) {
  const leadCalls = lead ? calls.filter((c) => (c as { lead_id?: string | null }).lead_id === lead.id) : [];
  const realCalls = leadCalls.filter((c) => c.status !== "manual_outcome");
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>{lead.name}</span>
                <StatusPill status={lead.status} />
                {realCalls.length === 0 && <NoCallBadge />}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {lead.company && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" /> {lead.company}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" /> {lead.phone}
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" /> {lead.email}
                  </div>
                )}
                {lead.source && (
                  <div className="text-muted-foreground text-xs uppercase tracking-wider">
                    Source: <span className="normal-case text-foreground">{lead.source}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-border p-2">
                  <div className="uppercase tracking-wider text-muted-foreground">Created</div>
                  <div>{fmtDateTime(lead.created_at)}</div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="uppercase tracking-wider text-muted-foreground">Last update</div>
                  <div>{fmtDateTime(lead.last_status_change_at)}</div>
                </div>
                {lead.contacted_at && (
                  <div className="rounded-md border border-border p-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Contacted</div>
                    <div>{fmtDateTime(lead.contacted_at)}</div>
                  </div>
                )}
                {lead.callback_at && (
                  <div className="rounded-md border border-border p-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Callback</div>
                    <div>{fmtDateTime(lead.callback_at)}</div>
                  </div>
                )}
              </div>

              {lead.notes && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">{lead.notes}</div>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Call recordings & transcripts ({leadCalls.length})
                </div>
                {leadCalls.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No calls yet for this lead.</div>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {leadCalls.map((c) => (
                      <CallRow key={c.id} call={c} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
