import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyDmTeam } from "@/lib/api/dm-setters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/dm-manager/")({
  component: DmManagerHome,
});

function DmManagerHome() {
  const { data, isLoading } = useQuery({ queryKey: ["my-dm-team"], queryFn: () => getMyDmTeam() });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalCommission = data.team.reduce((s, r) => s + (r.manager_commission ?? 0), 0);
  const target = data.manager?.daily_target ?? 100;
  const totalToday = (data.myLog?.ai_count ?? 0) + (data.myLog?.manual_adjustment ?? 0);
  const pct = Math.min(100, Math.round((totalToday / target) * 100));
  const link = data.manager?.apply_slug
    ? `https://conversionlab.space/apply?dm=${data.manager.apply_slug}`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">DM Manager Home</h1>
        <p className="text-sm text-muted-foreground">Your DMs, your apply link, and your team.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Today's DMs</CardTitle>
          <div className="text-sm text-muted-foreground">{totalToday} / {target}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} />
          <Button asChild size="sm"><Link to="/app/dm-setter/logs">Log DMs</Link></Button>
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

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">My leads (7.5%)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">${data.myStats.total_commission.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {data.myStats.applied} applied · {data.myStats.booked} booked · {data.myStats.closed} closed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Team override (2.5%)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">${totalCommission.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">Across {data.team.length} setter(s)</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">My DM Setters</h2>
        <div className="space-y-3">
          {data.team.map((row) => (
            <Card key={row.setter.id}>
              <CardHeader>
                <CardTitle className="text-base">{row.setter.full_name}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <Stat label="DMs today" value={row.today_dms} />
                <Stat label="Applied" value={row.stats.applied} />
                <Stat label="Booked" value={row.stats.booked} />
                <Stat label="No Show" value={row.stats.no_show} />
                <Stat label="DQ" value={row.stats.disqualified} />
                <Stat label="Closes" value={row.stats.closed} />
              </CardContent>
            </Card>
          ))}
          {data.team.length === 0 && <div className="text-sm text-muted-foreground">No setters assigned yet.</div>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
