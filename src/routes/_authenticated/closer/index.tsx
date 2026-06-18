import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCloserBookings } from "@/lib/api/b2c.functions";
import { meQueryOptions } from "@/routes/_authenticated/route";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Mail, Phone, Video } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closer/")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isCloser && !me.isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: CloserHome,
});

type B = {
  id: string;
  slot_start: string;
  status: string;
  zoom_join_url: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
};

function CloserHome() {
  const { data } = useQuery({ queryKey: ["closer-bookings"], queryFn: () => listCloserBookings() });
  const rows = ((data?.rows ?? []) as B[]).filter((r) => r.status === "assigned");
  const now = Date.now();
  const today = rows.filter((r) => {
    const d = new Date(r.slot_start);
    const t = d.getTime();
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return t >= start.getTime() && t < end.getTime();
  });
  const upcoming = rows.filter((r) => new Date(r.slot_start).getTime() >= now).slice(0, 10);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Your assigned calls live here.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Today" value={today.length} />
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Total assigned" value={rows.length} />
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Today</h2>
        <div className="grid gap-2">
          {today.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">No calls today.</Card>}
          {today.map((b) => <CallCard key={b.id} b={b} />)}
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Upcoming</h2>
        <div className="grid gap-2">
          {upcoming.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">Nothing booked yet.</Card>}
          {upcoming.map((b) => <CallCard key={b.id} b={b} />)}
        </div>
      </section>
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

function CallCard({ b }: { b: B }) {
  const dt = new Date(b.slot_start);
  const label = dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-2">{b.applicant_name} <Badge variant="secondary" className="text-[10px]">{b.status}</Badge></div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {label}</span>
          <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>
          {b.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.applicant_phone}</span>}
        </div>
      </div>
      {b.zoom_join_url && (
        <a href={b.zoom_join_url} target="_blank" rel="noreferrer">
          <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            <Video className="h-3 w-3" /> Join
          </button>
        </a>
      )}
    </Card>
  );
}
