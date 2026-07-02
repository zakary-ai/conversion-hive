import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyDmTeam } from "@/lib/api/dm-setters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/app/_authenticated/dm-manager/")({
  component: DmManagerHome,
});

function DmManagerHome() {
  const { data, isLoading } = useQuery({ queryKey: ["my-dm-team"], queryFn: () => getMyDmTeam() });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const totalCommission = data.team.reduce((s, r) => s + (r.manager_commission ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My DM Setters</h1>
        <p className="text-sm text-muted-foreground">Earn 2.5% override on every close from your team.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Override commission</CardTitle></CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">${totalCommission.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Across {data.team.length} setter(s)</div>
        </CardContent>
      </Card>

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
