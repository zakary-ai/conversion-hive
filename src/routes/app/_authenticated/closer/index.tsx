import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listCloserBookings, getCloserStats } from "@/lib/api/b2c.functions";
import { listMyAppointments } from "@/lib/api/cl.functions";
import { meQueryOptions } from "@/routes/app/_authenticated/route";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Mail, Phone, Video, ClipboardCheck, Target, Ban } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OutcomeDialog } from "@/components/closer-outcome-dialog";
import { LeadPreviewDialog } from "@/components/lead-preview-dialog";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";

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
};
type Appt = Awaited<ReturnType<typeof listMyAppointments>>[number];

function CloserHome() {
  const { data } = useQuery({ queryKey: ["closer-bookings"], queryFn: () => listCloserBookings() });
  const { data: apptsRaw = [] } = useQuery({ queryKey: ["my-appointments"], queryFn: () => listMyAppointments() });
  const rows = ((data?.rows ?? []) as B[]).filter((r) => r.status === "assigned");
  const b2bRows = (apptsRaw as Appt[]).filter((a) => a.type === "booking" && a.status !== "cancelled");
  const now = Date.now();
  const ET_TZ = "America/New_York";
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: ET_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const today = rows.filter((r) => {
    const k = new Intl.DateTimeFormat("en-CA", { timeZone: ET_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(r.slot_start));
    return k === todayKey;
  });
  const todayB2b = b2bRows.filter((a) => {
    const k = new Intl.DateTimeFormat("en-CA", { timeZone: ET_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(a.scheduled_at));
    return k === todayKey;
  });
  const upcoming = rows.filter((r) => new Date(r.slot_start).getTime() >= now).slice(0, 10);
  const upcomingB2b = b2bRows.filter((a) => new Date(a.scheduled_at).getTime() >= now).slice(0, 10);
  const dqB2b = (apptsRaw as Appt[]).filter((a) => a.type === "booking" && a.outcome === "disqualified");

  const [outcomeFor, setOutcomeFor] = useState<B | null>(null);
  const [previewFor, setPreviewFor] = useState<B | null>(null);
  const [apptFor, setApptFor] = useState<Appt | null>(null);
  const [dqOpen, setDqOpen] = useState(false);

  const [rangeDays, setRangeDays] = useState<number | null>(null);
  const { data: stats } = useQuery({
    queryKey: ["my-closer-stats", rangeDays],
    queryFn: () => getCloserStats({ data: { days: rangeDays ?? undefined } }),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Your assigned calls live here.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Today" value={today.length + todayB2b.length} />
        <StatCard label="Upcoming" value={upcoming.length + upcomingB2b.length} />
        <StatCard label="Total assigned" value={rows.length + b2bRows.length} />
        <Card
          className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setDqOpen(true)}
        >
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Ban className="h-3 w-3" /> DQ
          </div>
          <div className="text-3xl font-display font-semibold mt-1 text-muted-foreground">{dqB2b.length}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Tap to view</div>
        </Card>
        <Card className="p-4 col-span-2 sm:col-span-1">
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" /> Close rate
          </div>
          <div className="text-3xl font-display font-semibold mt-1 text-success">
            {stats ? `${stats.closeRate}%` : "—"}
          </div>
          {stats && (
            <div className="text-[10px] text-muted-foreground mt-1">
              {stats.closed + stats.deposit}/{stats.qualifiedCalls} qualified
            </div>
          )}
          <div className="mt-2">
            <RangePicker value={rangeDays} onChange={setRangeDays} />
          </div>
        </Card>
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Today</h2>
        <div className="grid gap-2">
          {today.length + todayB2b.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">No calls today.</Card>}
          {todayB2b.map((a) => <AppointmentCard key={a.id} a={a} onOpen={() => setApptFor(a)} />)}
          {today.map((b) => <CallCard key={b.id} b={b} onOutcome={() => setOutcomeFor(b)} onPreview={() => setPreviewFor(b)} />)}
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Upcoming</h2>
        <div className="grid gap-2">
          {upcoming.length + upcomingB2b.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">Nothing booked yet.</Card>}
          {upcomingB2b.map((a) => <AppointmentCard key={a.id} a={a} onOpen={() => setApptFor(a)} />)}
          {upcoming.map((b) => <CallCard key={b.id} b={b} onOutcome={() => setOutcomeFor(b)} onPreview={() => setPreviewFor(b)} />)}
        </div>
      </section>

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

      <Dialog open={dqOpen} onOpenChange={setDqOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Disqualified calls ({dqB2b.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {dqB2b.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No disqualified calls yet.</div>
            ) : dqB2b
              .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
              .map((a) => (
                <Card
                  key={a.id}
                  className="p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => { setDqOpen(false); setApptFor(a); }}
                >
                  <div className="font-medium text-sm">{a.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(a.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </Card>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-3xl font-display font-semibold mt-1">{value}</div>
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

function CallCard({ b, onOutcome, onPreview }: { b: B; onOutcome: () => void; onPreview: () => void }) {
  const dt = new Date(b.slot_start);
  const label = dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 cursor-pointer" onClick={onPreview}>
        <div className="font-medium flex items-center gap-2">
          <span className="text-primary hover:underline">{b.applicant_name}</span>
          <Badge variant="secondary" className="text-[10px]">{b.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {label}</span>
          <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>
          {b.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.applicant_phone}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {b.zoom_join_url && (
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
          <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {label}</span>
          {a.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {a.email}</span>}
          {a.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {a.phone}</span>}
        </div>
      </div>
      {a.meeting_url && (
        <a href={a.meeting_url} target="_blank" rel="noreferrer">
          <Button size="sm" className="gap-1"><Video className="h-3 w-3" /> Join</Button>
        </a>
      )}
    </Card>
  );
}

