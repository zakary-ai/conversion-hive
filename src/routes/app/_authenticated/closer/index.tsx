import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listCloserBookings } from "@/lib/api/b2c.functions";
import { listMyAppointments } from "@/lib/api/cl.functions";
import { meQueryOptions } from "@/routes/app/_authenticated/route";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CalendarClock, Mail, Phone, Video, ClipboardCheck, Target, Ban, CheckCircle2, X, Clock, CalendarIcon,
} from "lucide-react";
import { OutcomeDialog } from "@/components/closer-outcome-dialog";
import { LeadPreviewDialog } from "@/components/lead-preview-dialog";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { MyAvailabilitySection } from "@/components/my-availability-section";
import { getMyCloserLines } from "@/lib/api/closer-availability.functions";
import { SupportButton } from "@/components/support-button";

export const Route = createFileRoute("/app/_authenticated/closer/")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isCloser && !me.isAdmin) throw redirect({ to: "/app/dashboard" });
  },
  component: CloserHome,
});

type B = {
  id: string;
  application_id: string | null;
  slot_start: string;
  status: string;
  zoom_join_url: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  outcome: string | null;
  outcome_at: string | null;
};
type Appt = Awaited<ReturnType<typeof listMyAppointments>>[number];

type FilterKey = "today" | "closes" | "not-interested" | "dq" | "no-show" | "all";

const ET_TZ = "America/New_York";
const dayKey = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ET_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(typeof d === "string" ? new Date(d) : d);

function CloserHome() {
  const { data } = useQuery({ queryKey: ["closer-bookings"], queryFn: () => listCloserBookings() });
  const { data: apptsRaw = [] } = useQuery({ queryKey: ["my-appointments"], queryFn: () => listMyAppointments() });
  const { data: lines } = useQuery({ queryKey: ["my-closer-lines"], queryFn: () => getMyCloserLines() });

  const rows = ((data?.rows ?? []) as B[]).filter((r) => r.status !== "cancelled");
  const b2bRows = (apptsRaw as Appt[]).filter((a) => a.type === "booking" && a.status !== "cancelled");

  // Date range — default = today
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [from, setFrom] = useState<Date | undefined>(today);
  const [to, setTo] = useState<Date | undefined>(today);

  const fromMs = from ? from.getTime() : -Infinity;
  const toMs = to ? new Date(to).setHours(23, 59, 59, 999) : Infinity;

  // Today (based on ET calendar)
  const todayKey = dayKey(new Date());
  const todayCallsB2c = rows.filter((r) => dayKey(r.slot_start) === todayKey);
  const todayCallsB2b = b2bRows.filter((a) => dayKey(a.scheduled_at) === todayKey);
  const goingLiveToday = todayCallsB2c.length + todayCallsB2b.length;

  // Outcome buckets within [from, to] (by outcome_at / outcome_set_at)
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= fromMs && t <= toMs;
  };

  const b2cInRange = rows.filter((r) => r.outcome && inRange(r.outcome_at));
  const b2bInRange = b2bRows.filter((a) => a.outcome && inRange(a.outcome_set_at));

  const closes = [
    ...b2cInRange.filter((r) => r.outcome === "closed" || r.outcome === "deposit"),
    ...b2bInRange.filter((a) => a.outcome === "closed"),
  ];
  const notInterested = [
    ...b2cInRange.filter((r) => r.outcome === "not_interested"),
    ...b2bInRange.filter((a) => a.outcome === "lost"),
  ];
  const dq = [
    ...b2cInRange.filter((r) => r.outcome === "disqualified"),
    ...b2bInRange.filter((a) => a.outcome === "disqualified"),
  ];
  const noShow = [
    ...b2cInRange.filter((r) => r.outcome === "no_show"),
    ...b2bInRange.filter((a) => a.outcome === "no_show"),
  ];

  const closesCount = closes.length;
  const qualified = closesCount + notInterested.length;
  const closeRate = qualified > 0 ? Math.round((closesCount / qualified) * 1000) / 10 : 0;

  const [filter, setFilter] = useState<FilterKey>("today");

  const shownB2c: B[] =
    filter === "today"
      ? todayCallsB2c
      : filter === "closes"
        ? (closes.filter((x) => "slot_start" in x) as B[])
        : filter === "not-interested"
          ? (notInterested.filter((x) => "slot_start" in x) as B[])
          : filter === "dq"
            ? (dq.filter((x) => "slot_start" in x) as B[])
            : filter === "no-show"
              ? (noShow.filter((x) => "slot_start" in x) as B[])
              : [...closes, ...notInterested, ...dq, ...noShow].filter((x) => "slot_start" in x) as B[];

  const shownB2b: Appt[] =
    filter === "today"
      ? todayCallsB2b
      : filter === "closes"
        ? (closes.filter((x) => "scheduled_at" in x) as Appt[])
        : filter === "not-interested"
          ? (notInterested.filter((x) => "scheduled_at" in x) as Appt[])
          : filter === "dq"
            ? (dq.filter((x) => "scheduled_at" in x) as Appt[])
            : filter === "no-show"
              ? (noShow.filter((x) => "scheduled_at" in x) as Appt[])
              : [...closes, ...notInterested, ...dq, ...noShow].filter((x) => "scheduled_at" in x) as Appt[];

  const [outcomeFor, setOutcomeFor] = useState<B | null>(null);
  const [previewFor, setPreviewFor] = useState<B | null>(null);
  const [apptFor, setApptFor] = useState<Appt | null>(null);

  const fmtBtn = (d: Date | undefined) =>
    d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Pick date";

  const filterLabel: Record<FilterKey, string> = {
    today: "Today's calls",
    closes: "Closes",
    "not-interested": "Not interested",
    dq: "DQ",
    "no-show": "No show",
    all: "All outcomes in range",
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Your assigned calls live here.</p>
        </div>
        <SupportButton />
      </div>


      {/* Date range picker */}
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground">From</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-[160px] justify-start font-normal">
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {fmtBtn(from)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={from} onSelect={setFrom} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground">To</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-[160px] justify-start font-normal">
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {fmtBtn(to)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={to} onSelect={setTo} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => { setFrom(today); setTo(today); }}>Today</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            const d = new Date(today); d.setDate(d.getDate() - 6);
            setFrom(d); setTo(today);
          }}>7d</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            const d = new Date(today); d.setDate(d.getDate() - 29);
            setFrom(d); setTo(today);
          }}>30d</Button>
          <Button size="sm" variant="ghost" onClick={() => { setFrom(undefined); setTo(undefined); }}>All</Button>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<CalendarClock className="h-3 w-3" />}
          label="Calls going live today"
          value={goingLiveToday}
          onClick={() => setFilter("today")}
          active={filter === "today"}
        />
        <StatCard
          icon={<CheckCircle2 className="h-3 w-3" />}
          label="Closes"
          value={closesCount}
          tone="text-success"
          onClick={() => setFilter("closes")}
          active={filter === "closes"}
        />
        <StatCard
          icon={<X className="h-3 w-3" />}
          label="Not interested"
          value={notInterested.length}
          onClick={() => setFilter("not-interested")}
          active={filter === "not-interested"}
        />
        <StatCard
          icon={<Ban className="h-3 w-3" />}
          label="DQ"
          value={dq.length}
          onClick={() => setFilter("dq")}
          active={filter === "dq"}
        />
        <StatCard
          icon={<Clock className="h-3 w-3" />}
          label="No show"
          value={noShow.length}
          onClick={() => setFilter("no-show")}
          active={filter === "no-show"}
        />
        <StatCard
          icon={<Target className="h-3 w-3" />}
          label="Close rate"
          value={`${closeRate}%`}
          tone="text-success"
          onClick={() => setFilter("all")}
          active={filter === "all"}
          hint={qualified > 0 ? `${closesCount}/${qualified} qualified` : undefined}
        />
      </div>

      {/* List */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">{filterLabel[filter]}</h2>
          <Badge variant="secondary">{shownB2c.length + shownB2b.length}</Badge>
        </div>
        <div className="grid gap-2">
          {shownB2c.length + shownB2b.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground text-center">
              {filter === "today" ? "No calls today." : "Nothing in this range."}
            </Card>
          )}
          {shownB2b.map((a) => <AppointmentCard key={a.id} a={a} onOpen={() => setApptFor(a)} />)}
          {shownB2c.map((b) => <CallCard key={b.id} b={b} onOutcome={() => setOutcomeFor(b)} onPreview={() => setPreviewFor(b)} />)}
        </div>
      </section>

      {(lines?.b2b || lines?.b2c) && (
        <MyAvailabilitySection
          lines={[
            ...(lines?.b2b ? (["b2b"] as const) : []),
            ...(lines?.b2c ? (["b2c"] as const) : []),
          ]}
          label={
            lines?.b2b && lines?.b2c
              ? "My availability & notes"
              : lines?.b2b
                ? "My B2B availability & notes"
                : "My B2C availability & notes"
          }
        />
      )}

      {outcomeFor && (
        <OutcomeDialog
          bookingId={outcomeFor.id}
          applicationId={outcomeFor.application_id}
          applicantName={outcomeFor.applicant_name}
          open={!!outcomeFor}
          onOpenChange={(v) => !v && setOutcomeFor(null)}
        />
      )}
      <LeadPreviewDialog
        booking={previewFor}
        open={!!previewFor}
        onOpenChange={(v) => !v && setPreviewFor(null)}
      />
      <AppointmentDetailDialog appt={apptFor} onClose={() => setApptFor(null)} />
    </div>
  );
}

function StatCard({
  icon, label, value, tone, onClick, active, hint,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  tone?: string;
  onClick?: () => void;
  active?: boolean;
  hint?: string;
}) {
  return (
    <Card
      className={cn(
        "p-4 cursor-pointer hover:bg-muted/30 transition-colors",
        active && "ring-1 ring-primary",
      )}
      onClick={onClick}
    >
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={cn("text-3xl font-display font-semibold mt-1", tone)}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function CallCard({ b, onOutcome, onPreview }: { b: B; onOutcome: () => void; onPreview: () => void }) {
  const dt = new Date(b.slot_start);
  const label = dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 cursor-pointer" onClick={onPreview}>
        <div className="font-medium flex items-center gap-2">
          <span className="text-primary hover:underline">{b.applicant_name}</span>
          <Badge variant="secondary" className="text-[10px]">{b.outcome ?? b.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {label}</span>
          <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>
          {b.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.applicant_phone}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {b.zoom_join_url && !b.outcome && (
          <a href={b.zoom_join_url} target="_blank" rel="noreferrer">
            <Button size="sm" className="gap-1"><Video className="h-3 w-3" /> Join</Button>
          </a>
        )}
        <Button size="sm" variant="outline" className="gap-1" onClick={onOutcome}>
          <ClipboardCheck className="h-3 w-3" /> Outcome
        </Button>
      </div>
    </Card>
  );
}

function AppointmentCard({ a, onOpen }: { a: Appt; onOpen: () => void }) {
  const dt = new Date(a.scheduled_at);
  const label = dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="font-medium flex items-center gap-2">
          <span className="text-primary hover:underline">{a.name}</span>
          <Badge variant="secondary" className="text-[10px]">B2B</Badge>
          <Badge variant="secondary" className="text-[10px]">{a.outcome ?? a.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {label}</span>
          {a.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {a.email}</span>}
          {a.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {a.phone}</span>}
        </div>
      </div>
      {a.meeting_url && !a.outcome && (
        <a href={a.meeting_url} target="_blank" rel="noreferrer">
          <Button size="sm" className="gap-1"><Video className="h-3 w-3" /> Join</Button>
        </a>
      )}
    </Card>
  );
}

const RANGE_OPTS: { label: string; days: number | null }[] = [
  { label: "1d", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "All", days: null },
];

export function RangePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
      {RANGE_OPTS.map((o) => {
        const active = o.days === value;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.days)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${active ? "bg-background text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
