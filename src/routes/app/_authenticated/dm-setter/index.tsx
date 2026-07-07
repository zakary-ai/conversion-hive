import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyDmStats } from "@/lib/api/dm-setters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Copy, MessageCircle, CalendarCheck, XCircle, Ban, UserX, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_authenticated/dm-setter/")({
  component: DmSetterHome,
});

function DmSetterHome() {
  const { data, isLoading } = useQuery({ queryKey: ["my-dm-stats"], queryFn: () => getMyDmStats() });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const total_today = (data.todayLog?.ai_count ?? 0) + (data.todayLog?.manual_adjustment ?? 0);
  const target = data.dmSetter?.daily_target ?? 100;
  const pct = Math.min(100, Math.round((total_today / target) * 100));

  const link = data.dmSetter?.apply_slug
    ? `https://conversionlab.space/apply?dm=${data.dmSetter.apply_slug}`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DM Setter Home</h1>
        <p className="text-sm text-muted-foreground">Track your daily DMs and the leads that come through your link.</p>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your apply link</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm font-mono break-all">{link || "—"}</div>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}>
            <Copy className="h-4 w-4 mr-1" /> Copy link
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={MessageCircle} label="Applied" value={data.stats.applied} />
        <StatCard icon={CalendarCheck} label="Booked" value={data.stats.booked} />
        <StatCard icon={UserX} label="No Show" value={data.stats.no_show} />
        <StatCard icon={Ban} label="Disqualified" value={data.stats.disqualified} />
        <StatCard icon={XCircle} label="Not Interested" value={data.stats.not_interested} />
        <StatCard icon={DollarSign} label="Closes" value={data.stats.closed} />
      </div>

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

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
