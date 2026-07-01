import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getClientDetail, backfillSetterCallArtifacts } from "@/lib/api/cl.functions";

import { PageHeader, StatCard, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, GraduationCap, CheckCircle2, XCircle, Clock, CalendarClock, Phone, ChevronDown, Mail, Building2, Search, CalendarIcon, AlertTriangle, UserX } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/_authenticated/admin/clients/$userId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.userId, null, null)),
  component: SetterDetailPage,
});

const opts = (id: string, from: string | null, to: string | null) => queryOptions({
  queryKey: ["client-detail", id, from ?? "all", to ?? "all"],
  queryFn: () => getClientDetail({ data: { user_id: id, range: "all", ...(from ? { from } : {}), ...(to ? { to } : {}) } }),
});

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- EST-aware day boundaries ----------
const NY_TZ = "America/New_York";

// Returns the NY timezone offset (in minutes east of UTC — negative for NY) for the given instant.
function nyOffsetMinutes(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(d).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second);
  return (asUTC - d.getTime()) / 60000;
}

// Get the NY calendar Y/M/D for a given instant.
function nyDateParts(d: Date): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: NY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, day] = dtf.format(d).split("-").map(Number);
  return { y, m, d: day };
}

// Return the UTC instant for NY midnight on the NY calendar date of `d`.
function startOfDay(d: Date): Date {
  const p = nyDateParts(d);
  const guess = new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
  const off = nyOffsetMinutes(guess);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0, 0) - off * 60000);
}

function endOfDay(d: Date): Date {
  const p = nyDateParts(d);
  const guess = new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
  const off = nyOffsetMinutes(guess);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 23, 59, 59, 999) - off * 60000);
}

// A Date object that represents the NY-today calendar day (used only as a marker in dateRange).
function nyToday(): Date {
  const p = nyDateParts(new Date());
  // Return a UTC-noon instant on that calendar date so display formatting is stable.
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
}

function sameNyDay(a: Date, b: Date): boolean {
  const pa = nyDateParts(a); const pb = nyDateParts(b);
  return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
}

const nyDayLabel = (d: Date) =>
  new Intl.DateTimeFormat(undefined, { timeZone: NY_TZ, month: "short", day: "numeric", year: "numeric" }).format(d);
const nyDayLabelShort = (d: Date) =>
  new Intl.DateTimeFormat(undefined, { timeZone: NY_TZ, month: "short", day: "numeric" }).format(d);

type StatKey = "bookings" | "closed" | "lost" | "no_show" | "dials" | "training";

function SetterDetailPage() {
  const { userId } = Route.useParams();
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>(() => {
    const t = nyToday();
    return { from: t, to: t };
  });
  const fromIso = dateRange.from ? startOfDay(dateRange.from).toISOString() : null;
  const toIso = dateRange.to ? endOfDay(dateRange.to).toISOString() : null;
  const { data } = useSuspenseQuery(opts(userId, fromIso, toIso));
  const [statOpen, setStatOpen] = useState<StatKey | null>(null);

  const progress = data.totalModules ? Math.round((data.completions.length / data.totalModules) * 100) : 0;

  const today = nyToday();
  const isToday = !!(dateRange.from && dateRange.to && sameNyDay(dateRange.from, today) && sameNyDay(dateRange.to, today));

  const rangeLabel = dateRange.from && dateRange.to
    ? (sameNyDay(dateRange.from, dateRange.to) ? nyDayLabel(dateRange.from) : `${nyDayLabelShort(dateRange.from)} – ${nyDayLabelShort(dateRange.to)}`)
    : dateRange.from
    ? nyDayLabel(dateRange.from)
    : "All time";

  const setToday = () => {
    const t = nyToday();
    setDateRange({ from: t, to: t });
  };


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

      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" variant={isToday ? "default" : "outline"} onClick={setToday}>Today</Button>
        <DateRangePicker value={dateRange} onChange={setDateRange} label={rangeLabel} />
        {(dateRange.from || dateRange.to) && (
          <Button size="sm" variant="ghost" onClick={() => setDateRange({ from: null, to: null })}>Clear</Button>
        )}
      </div>


      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <ClickableStat label="Bookings" value={data.stats.bookings} icon={CalendarClock} onClick={() => setStatOpen("bookings")} />
        <ClickableStat label="Closed" value={data.stats.closed} icon={CheckCircle2} onClick={() => setStatOpen("closed")} />
        <ClickableStat label="Lost/DQ" value={data.stats.lost} icon={XCircle} onClick={() => setStatOpen("lost")} />
        <ClickableStat label="No Show" value={data.stats.no_show ?? 0} icon={UserX} onClick={() => setStatOpen("no_show")} />
        <ClickableStat label="Dials" value={data.stats.dials} icon={Phone} onClick={() => setStatOpen("dials")} />
        <ClickableStat label="Training" value={`${progress}%`} icon={GraduationCap} onClick={() => setStatOpen("training")} />
      </div>

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-3">Training progress</h3>
        <Progress value={progress} className="h-2" />
        <div className="text-xs text-muted-foreground mt-2">{data.completions.length} of {data.totalModules} modules complete</div>
      </Card>

      <BookingHistoryCard appointments={data.appointments as ApptRow[]} />

      <QuizScoresCard attempts={data.attempts as QuizAttempt[]} />

      <TodaysLeadsCard
        leads={data.leads as SetterLead[]}
        calls={data.calls as CallRowItem[]}
      />

      <LeadHistoryCard
        leads={data.leads as SetterLead[]}
        calls={data.calls as CallRowItem[]}
      />

      <StatDetailDialog
        statKey={statOpen}
        onClose={() => setStatOpen(null)}
        appointments={data.appointments as ApptRow[]}
        calls={data.calls as CallRowItem[]}
        attempts={data.attempts as QuizAttempt[]}
        completions={data.completions as { module_id: string; completed_at?: string | null }[]}
        totalModules={data.totalModules}
        fromMs={dateRange.from ? startOfDay(dateRange.from).getTime() : null}
        toMs={dateRange.to ? endOfDay(dateRange.to).getTime() : null}
      />

    </div>
  );
}

function ClickableStat({ label, value, icon, onClick }: { label: string; value: number | string; icon: typeof CalendarClock; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
      <StatCard label={label} value={value} icon={icon} />
    </button>
  );
}

function DateRangePicker({ value, onChange, label }: { value: { from: Date | null; to: Date | null }; onChange: (v: { from: Date | null; to: Date | null }) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarIcon className="h-4 w-4" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={{ from: value.from ?? undefined, to: value.to ?? undefined }}
          onSelect={(r) => {
            onChange({ from: r?.from ?? null, to: r?.to ?? null });
            if (r?.from && r?.to) setOpen(false);
          }}
          numberOfMonths={2}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------- Stat detail dialog ----------

type ApptRow = {
  id: string;
  name: string;
  type: string;
  outcome: string | null;
  scheduled_at: string;
  deal_amount: number | string | null;
  lost_reason: string | null;
};

type QuizAttempt = {
  id: string;
  score: number;
  completed_at: string;
  modules?: { title?: string } | null;
};

function StatDetailDialog({ statKey, onClose, appointments, calls, attempts, completions, totalModules }: {
  statKey: StatKey | null;
  onClose: () => void;
  appointments: ApptRow[];
  calls: CallRowItem[];
  attempts: QuizAttempt[];
  completions: { module_id: string; completed_at?: string | null }[];
  totalModules: number;
}) {
  const bookings = appointments.filter((a) => a.type === "booking");
  const title = statKey === "bookings" ? "Bookings"
    : statKey === "closed" ? "Closed"
    : statKey === "lost" ? "Lost / DQ"
    : statKey === "no_show" ? "No Show"
    : statKey === "dials" ? "Dials"
    : statKey === "training" ? "Training progress"
    : "";

  const rows = statKey === "bookings" ? bookings
    : statKey === "closed" ? bookings.filter((a) => a.outcome === "closed")
    : statKey === "lost" ? bookings.filter((a) => a.outcome === "lost")
    : statKey === "no_show" ? bookings.filter((a) => a.outcome === "no_show")
    : [];

  return (
    <Dialog open={statKey !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {statKey === "dials" ? (
          <div className="divide-y divide-border rounded-md border border-border">
            {calls.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No calls.</div>
            ) : calls.map((c) => <CallRow key={c.id} call={c} />)}
          </div>
        ) : statKey === "training" ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Modules completed</div>
              <div>{completions.length} of {totalModules}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Quiz attempts</div>
              {attempts.length === 0 ? <div className="text-muted-foreground">No attempts yet.</div> : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {attempts.map((a) => (
                    <div key={a.id} className="p-2 flex justify-between">
                      <span>{a.modules?.title ?? "Module"}</span>
                      <span className="font-medium">{a.score}% · {fmtDate(a.completed_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Nothing to show.</div>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {rows.map((a) => (
              <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(a.scheduled_at)}</div>
                  {a.lost_reason && <div className="text-xs text-destructive mt-0.5">{a.lost_reason}</div>}
                </div>
                <div className="text-right text-xs">
                  {a.outcome === "closed" && a.deal_amount != null && (
                    <div className="text-success font-medium flex items-center gap-1 justify-end">
                      <DollarSign className="h-3 w-3" />{money(Number(a.deal_amount))}
                    </div>
                  )}
                  <div className="uppercase tracking-wider text-muted-foreground">{a.outcome ?? "pending"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Booking history (calendar) ----------

function BookingHistoryCard({ appointments }: { appointments: ApptRow[] }) {
  const bookings = useMemo(() => appointments.filter((a) => a.type === "booking"), [appointments]);
  const [date, setDate] = useState<Date | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [openAppt, setOpenAppt] = useState<ApptRow | null>(null);

  const filtered = useMemo(() => {
    if (!date) return bookings.slice(0, 50);
    const s = startOfDay(date).getTime();
    const e = endOfDay(date).getTime();
    return bookings.filter((a) => {
      const t = new Date(a.scheduled_at).getTime();
      return t >= s && t <= e;
    });
  }, [bookings, date]);

  const dateLabel = date
    ? date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "All bookings";

  return (
    <>
      <Card className="overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold">Booking history ({filtered.length})</h3>
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
                  selected={date ?? undefined}
                  onSelect={(d) => {
                    setDate(d ?? null);
                    setCalOpen(false);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {date && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDate(null)}>Clear</Button>
            )}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No bookings for this date.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((a) => (
              <button key={a.id} onClick={() => setOpenAppt(a)} className="w-full p-3 flex items-center gap-3 text-sm hover:bg-muted/30 text-left">
                <div className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                  a.outcome === "closed" ? "bg-success/15 text-success" :
                  a.outcome === "lost" ? "bg-destructive/15 text-destructive" :
                  a.outcome === "no_show" ? "bg-warning/15 text-warning" :
                  "bg-muted text-muted-foreground"
                )}>
                  {a.outcome === "closed" ? <CheckCircle2 className="h-4 w-4" /> :
                   a.outcome === "lost" ? <XCircle className="h-4 w-4" /> :
                   a.outcome === "no_show" ? <UserX className="h-4 w-4" /> :
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
                  <div className="uppercase tracking-wider text-muted-foreground">{a.outcome ?? "pending"}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={!!openAppt} onOpenChange={(o) => !o && setOpenAppt(null)}>
        <DialogContent className="max-w-lg">
          {openAppt && (
            <>
              <DialogHeader><DialogTitle>{openAppt.name}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border p-2">
                    <div className="uppercase tracking-wider text-muted-foreground text-xs">Scheduled</div>
                    <div>{fmtDateTime(openAppt.scheduled_at)}</div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="uppercase tracking-wider text-muted-foreground text-xs">Outcome</div>
                    <div className="uppercase tracking-wider">{openAppt.outcome ?? "pending"}</div>
                  </div>
                  {openAppt.deal_amount != null && (
                    <div className="rounded-md border border-border p-2">
                      <div className="uppercase tracking-wider text-muted-foreground text-xs">Deal amount</div>
                      <div className="text-success font-medium">{money(Number(openAppt.deal_amount))}</div>
                    </div>
                  )}
                </div>
                {openAppt.lost_reason && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Lost reason</div>
                    <div className="text-sm whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">{openAppt.lost_reason}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Quiz scores (collapsible, minimized) ----------

function QuizScoresCard({ attempts }: { attempts: QuizAttempt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/20">
          <h3 className="font-display font-semibold">Quiz scores ({attempts.length})</h3>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 pt-0">
            {attempts.length === 0 ? <div className="text-sm text-muted-foreground">No attempts yet.</div> : (
              <div className="space-y-2">
                {attempts.slice(0, 10).map((a) => (
                  <div key={a.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                    <span>{a.modules?.title ?? "Module"}</span>
                    <span className="font-medium">{a.score}% · {fmtDate(a.completed_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ---------- Backfill ----------

function BackfillButton({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => backfillSetterCallArtifacts({ data: { user_id: userId, since_days: 14 } }),
    onSuccess: () => {
      toast.success("Backfill queued");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? "Working…" : "Backfill calls"}
    </Button>
  );
}

// ---------- Call row ----------

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
  const [collapsed, setCollapsed] = useState(false);

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
          <button className="flex items-center gap-2 font-display font-semibold" onClick={() => setCollapsed((c) => !c)}>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
            Today's Leads ({list.length})
          </button>
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
        {!collapsed && (list.length === 0 ? (
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
        ))}
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
      <DialogContent className="max-w-2xl">
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
