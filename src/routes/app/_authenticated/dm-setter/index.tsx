import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyDmStats } from "@/lib/api/dm-setters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, MessageCircle, CalendarCheck, XCircle, Ban, UserX, DollarSign, Mail, Phone, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { SupportButton } from "@/components/support-button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/_authenticated/dm-setter/")({
  component: DmSetterHome,
});

type RangeKey = "today" | "7d" | "30d" | "all" | "custom";

function computeRange(key: RangeKey, from: string, to: string): { from?: string; to?: string } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === "today") {
    const end = new Date(startOfToday.getTime() + 86_400_000);
    return { from: startOfToday.toISOString(), to: end.toISOString() };
  }
  if (key === "7d") {
    const start = new Date(startOfToday.getTime() - 6 * 86_400_000);
    return { from: start.toISOString() };
  }
  if (key === "30d") {
    const start = new Date(startOfToday.getTime() - 29 * 86_400_000);
    return { from: start.toISOString() };
  }
  if (key === "custom") {
    const r: { from?: string; to?: string } = {};
    if (from) r.from = new Date(from + "T00:00:00").toISOString();
    if (to) {
      const d = new Date(to + "T00:00:00");
      r.to = new Date(d.getTime() + 86_400_000).toISOString();
    }
    return r;
  }
  return {};
}

type Category = "applied" | "booked" | "no_show" | "disqualified" | "not_interested" | "closed";

function DmSetterHome() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [category, setCategory] = useState<Category | null>(null);

  const range = useMemo(() => computeRange(rangeKey, from, to), [rangeKey, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-dm-stats", range.from ?? null, range.to ?? null],
    queryFn: () => getMyDmStats({ data: { from: range.from ?? null, to: range.to ?? null } }),
  });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const total_today = (data.todayLog?.ai_count ?? 0) + (data.todayLog?.manual_adjustment ?? 0);
  const target = data.dmSetter?.daily_target ?? 100;
  const pct = Math.min(100, Math.round((total_today / target) * 100));

  const link = data.dmSetter?.apply_slug
    ? `https://conversionlab.space/apply?dm=${data.dmSetter.apply_slug}`
    : "";

  const rangeOpts: { key: RangeKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "all", label: "All time" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DM Setter Home</h1>
          <p className="text-sm text-muted-foreground">Track your daily DMs and the leads that come through your link.</p>
        </div>
        <SupportButton />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Today's DMs</CardTitle>
          <div className="text-sm text-muted-foreground">{total_today} / {target}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} />
          <div className="flex gap-2">
            <Button asChild size="sm"><Link to="/app/dm-setter/logs">Log DMs</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/app/dm-setter/calendar">View Calendar</Link></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your apply link</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm font-mono break-all">{link || "—"}</div>
          <Button size="sm" variant="outline" onClick={async () => {
            if (!link) { toast.error("No link yet"); return; }
            try {
              if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(link);
              } else {
                const ta = document.createElement("textarea");
                ta.value = link;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
              }
              toast.success("Copied");
            } catch {
              toast.error("Couldn't copy — long-press the link to copy");
            }
          }}>
            <Copy className="h-4 w-4 mr-1" /> Copy link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads</CardTitle>
          <p className="text-xs text-muted-foreground">Filter by time period, then tap a category to see the leads inside.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {rangeOpts.map((o) => (
              <Button
                key={o.key}
                size="sm"
                variant={rangeKey === o.key ? "default" : "outline"}
                onClick={() => setRangeKey(o.key)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          {rangeKey === "custom" && (
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard active={category === "applied"} onClick={() => setCategory(category === "applied" ? null : "applied")} icon={MessageCircle} label="Applied" value={data.stats.applied} />
            <StatCard active={category === "booked"} onClick={() => setCategory(category === "booked" ? null : "booked")} icon={CalendarCheck} label="Booked" value={data.stats.booked} />
            <StatCard active={category === "no_show"} onClick={() => setCategory(category === "no_show" ? null : "no_show")} icon={UserX} label="No Show" value={data.stats.no_show} />
            <StatCard active={category === "disqualified"} onClick={() => setCategory(category === "disqualified" ? null : "disqualified")} icon={Ban} label="Disqualified" value={data.stats.disqualified} />
            <StatCard active={category === "not_interested"} onClick={() => setCategory(category === "not_interested" ? null : "not_interested")} icon={XCircle} label="Not Interested" value={data.stats.not_interested} />
            <StatCard active={category === "closed"} onClick={() => setCategory(category === "closed" ? null : "closed")} icon={DollarSign} label="Closes" value={data.stats.closed} />
          </div>

          {category && (
            <LeadList
              category={category}
              applications={data.applications as Array<{ id: string; created_at: string; full_name: string | null; email: string | null; phone: string | null }>}
              bookings={data.bookings as Array<{ id: string; applicant_name: string | null; applicant_email: string | null; slot_start: string; status: string | null; outcome: string | null; deal_amount: number | null }>}
              onClose={() => setCategory(null)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Commission earned</CardTitle></CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">${data.stats.total_commission.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">{(() => { const r = Number((data.dmSetter as { commission_rate?: number | string | null } | undefined)?.commission_rate ?? 0.075); return `${(r * 100).toFixed(r * 100 % 1 === 0 ? 0 : 1)}%`; })()} of ${data.stats.total_revenue.toFixed(2)} closed revenue</div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, active, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-card transition-colors hover:border-primary/60 hover:bg-accent/30",
        active && "border-primary bg-accent/40 ring-1 ring-primary/40",
      )}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </div>
    </button>
  );
}

function LeadList({
  category, applications, bookings, onClose,
}: {
  category: Category;
  applications: Array<{ id: string; created_at: string; full_name: string | null; email: string | null; phone: string | null }>;
  bookings: Array<{ id: string; applicant_name: string | null; applicant_email: string | null; slot_start: string; status: string | null; outcome: string | null; deal_amount: number | null }>;
  onClose: () => void;
}) {
  const labels: Record<Category, string> = {
    applied: "Applied",
    booked: "Booked",
    no_show: "No Show",
    disqualified: "Disqualified",
    not_interested: "Not Interested",
    closed: "Closes",
  };

  if (category === "applied") {
    return (
      <div className="rounded-lg border bg-background/40 p-3 space-y-2">
        <Header title={labels[category]} count={applications.length} onClose={onClose} />
        {applications.length === 0 ? (
          <Empty />
        ) : applications.map((a) => (
          <div key={a.id} className="rounded-md border p-3 text-sm">
            <div className="font-medium">{a.full_name || "—"}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(a.created_at).toLocaleDateString()}</span>
              {a.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {a.email}</span>}
              {a.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {a.phone}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filter = (b: (typeof bookings)[number]) => {
    if (category === "booked") return true;
    if (category === "closed") return b.outcome === "closed";
    return b.outcome === category;
  };
  const list = bookings.filter(filter);

  return (
    <div className="rounded-lg border bg-background/40 p-3 space-y-2">
      <Header title={labels[category]} count={list.length} onClose={onClose} />
      {list.length === 0 ? (
        <Empty />
      ) : list.map((b) => (
        <div key={b.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-medium">{b.applicant_name || "—"}</div>
            <div className="flex gap-1">
              {b.status && <Badge variant="secondary" className="text-[10px]">{b.status}</Badge>}
              {b.outcome && <Badge variant="outline" className="text-[10px]">{b.outcome}</Badge>}
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(b.slot_start).toLocaleString()}</span>
            {b.applicant_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.applicant_email}</span>}
            {b.outcome === "closed" && b.deal_amount != null && (
              <span className="inline-flex items-center gap-1 text-primary"><DollarSign className="h-3 w-3" /> ${Number(b.deal_amount).toFixed(2)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Header({ title, count, onClose }: { title: string; count: number; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium">{title} <span className="text-muted-foreground">({count})</span></div>
      <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground p-2">No leads in this category for the selected range.</div>;
}
