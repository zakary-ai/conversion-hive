import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyDmTeam, inviteDmSetterAsManager } from "@/lib/api/dm-setters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Copy, UserPlus } from "lucide-react";
import { SupportButton } from "@/components/support-button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/dm-manager/")({
  component: DmManagerHome,
});

function DmManagerHome() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-dm-team"],
    queryFn: () => getMyDmTeam(),
    retry: 1,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", commission_rate: 0.075 });

  const invite = useMutation({
    mutationFn: () => inviteDmSetterAsManager({ data: {
      full_name: form.full_name, email: form.email, commission_rate: form.commission_rate,
    } }),
    onSuccess: () => {
      toast.success("Setter invited — email sent");
      setInviteOpen(false);
      setForm({ full_name: "", email: "", commission_rate: 0.075 });
      qc.invalidateQueries({ queryKey: ["my-dm-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-3 w-3 rounded-full bg-primary/60 animate-pulse" />
        Loading your team…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="max-w-md space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="font-semibold">Couldn't load your dashboard</div>
        <div className="text-sm text-muted-foreground break-words">
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
        <Button size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const totalCommission = data.team.reduce((s, r) => s + (r.manager_commission ?? 0), 0);
  const target = data.manager?.daily_target ?? 100;
  const totalToday = (data.myLog?.ai_count ?? 0) + (data.myLog?.manual_adjustment ?? 0);
  const pct = Math.min(100, Math.round((totalToday / target) * 100));
  const link = data.manager?.apply_slug
    ? `https://conversionlab.space/apply?dm=${data.manager.apply_slug}`
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">DM Manager Home</h1>
          <p className="text-sm text-muted-foreground">Your DMs, your apply link, and your team.</p>
        </div>
        <SupportButton />
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">My DM Setters</h2>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Invite setter</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite a DM setter</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  They'll be added to your team automatically and receive a login email.
                </p>
                <div>
                  <Label>Full name</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    maxLength={200}
                  />
                </div>
                <div>
                  <Label>Commission tier</Label>
                  <Select
                    value={String(form.commission_rate)}
                    onValueChange={(v) => setForm({ ...form, commission_rate: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.075">Standard — 7.5% per closed deal</SelectItem>
                      <SelectItem value="0.1">Premium — 10% per closed deal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={!form.full_name.trim() || !form.email.trim() || invite.isPending}
                  onClick={() => invite.mutate()}
                >
                  {invite.isPending ? "Inviting…" : "Send invite"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
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
