import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getClientDashboard, getMe, listMyCommissions } from "@/lib/api/cl.functions";
import { StatCard, PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, CheckCircle2, Clock, GraduationCap, DollarSign, ArrowRight, ListChecks } from "lucide-react";

const dashboardOpts = queryOptions({
  queryKey: ["client-dashboard"],
  queryFn: () => getClientDashboard(),
});

const meOpts = queryOptions({ queryKey: ["me"], queryFn: () => getMe() });

export const Route = createFileRoute("/app/_authenticated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardOpts),
  component: ClientDashboard,
});

function ClientDashboard() {
  const { data } = useSuspenseQuery(dashboardOpts);
  const { data: me } = useSuspenseQuery(meOpts);
  const name = me.profile?.full_name?.split(" ")[0] || "there";
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader
        title={`Welcome back, ${name}`}
        description="Here's what's happening with your pipeline today."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's leads" value={data.todayLeads} icon={Briefcase} hint="New leads added today" />
        <StatCard label="Contacted today" value={data.contactedToday} icon={CheckCircle2} />
        <StatCard label="Leads remaining" value={data.remaining} icon={Clock} hint={`of ${data.totalLeads} assigned`} />
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          className="text-left rounded-xl transition-all hover:ring-2 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/60"
          aria-label="View commission breakdown"
        >
          <StatCard
            label="Commission balance"
            value={`$${data.balance.toLocaleString(undefined,{minimumFractionDigits:2})}`}
            icon={DollarSign}
            hint="Tap for breakdown"
          />
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Training progress</div>
              <div className="mt-1 text-2xl font-display font-semibold">{data.progress}%</div>
              <div className="text-xs text-muted-foreground">{data.doneModules} of {data.totalModules} modules complete</div>
            </div>
            <GraduationCap className="h-8 w-8 text-primary" />
          </div>
          <Progress value={data.progress} className="h-2" />
          <Link to="/app/training" className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:underline">
            Continue training <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>

        <Card className="p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Quick links</div>
          <div className="space-y-2">
            <QuickLink to="/app/training" icon={GraduationCap} label="Training modules" />
            <QuickLink to="/app/leads" icon={Briefcase} label="My leads" />
            <QuickLink to="/app/profile" icon={ListChecks} label="My profile" />
            <QuickLink to="/app/commissions" icon={DollarSign} label="View commissions" />
          </div>
        </Card>
      </div>

      <CommissionBreakdownDialog open={breakdownOpen} onClose={() => setBreakdownOpen(false)} />
    </div>
  );
}

function CommissionBreakdownDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["my-commissions"],
    queryFn: () => listMyCommissions(),
    enabled: open,
  });

  const totalEarned = entries.reduce((s, e) => s + Number(e.amount), 0);
  const paid = entries.filter((e) => e.paid_at);
  const unpaid = entries.filter((e) => !e.paid_at);
  const totalPaid = paid.reduce((s, e) => s + Number(e.amount), 0);
  const totalUnpaid = unpaid.reduce((s, e) => s + Number(e.amount), 0);

  const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" /> Commission breakdown</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 my-3">
          <Tile label="Owed" value={fmtMoney(totalUnpaid)} tone="text-warning" />
          <Tile label="Paid" value={fmtMoney(totalPaid)} tone="text-success" />
          <Tile label="Total earned" value={fmtMoney(totalEarned)} tone="text-foreground" />
        </div>

        <div className="space-y-3">
          <Section title={`Unpaid (${unpaid.length})`} empty="No unpaid commissions.">
            {unpaid.map((e) => (
              <Row
                key={e.id}
                amount={fmtMoney(Number(e.amount))}
                amountTone="text-warning"
                note={e.note || "—"}
                meta={`Earned ${fmtDate(e.created_at)}`}
              />
            ))}
          </Section>
          <Section title={`Paid (${paid.length})`} empty="No payouts yet.">
            {paid.map((e) => (
              <Row
                key={e.id}
                amount={fmtMoney(Number(e.amount))}
                amountTone="text-success"
                note={e.note || "—"}
                meta={`Paid ${fmtDate(e.paid_at)}${e.paid_method ? ` · ${e.paid_method}` : ""} · Earned ${fmtDate(e.created_at)}`}
              />
            ))}
          </Section>
        </div>

        {isLoading && <div className="text-center text-sm text-muted-foreground py-4">Loading…</div>}
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-display font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.filter(Boolean).length > 0;
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      {hasItems ? <div className="space-y-2">{children}</div> : <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground text-center">{empty}</div>}
    </div>
  );
}

function Row({ amount, amountTone, note, meta }: { amount: string; amountTone: string; note: string; meta: string }) {
  return (
    <div className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{note}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{meta}</div>
      </div>
      <div className={`font-semibold whitespace-nowrap ${amountTone}`}>{amount}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Briefcase; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 transition-colors group">
      <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary" />{label}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}
