import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getClientDashboard, getMe } from "@/lib/api/cl.functions";
import { StatCard, PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Briefcase, CheckCircle2, Clock, GraduationCap, DollarSign, ArrowRight, ListChecks } from "lucide-react";

const dashboardOpts = queryOptions({
  queryKey: ["client-dashboard"],
  queryFn: () => getClientDashboard(),
});

const meOpts = queryOptions({ queryKey: ["me"], queryFn: () => getMe() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardOpts),
  component: ClientDashboard,
});

function ClientDashboard() {
  const { data } = useSuspenseQuery(dashboardOpts);
  const { data: me } = useSuspenseQuery(meOpts);
  const name = me.profile?.full_name?.split(" ")[0] || "there";

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
        <StatCard label="Commission balance" value={`$${data.balance.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={DollarSign} />
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
          <Link to="/training" className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:underline">
            Continue training <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>

        <Card className="p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Quick links</div>
          <div className="space-y-2">
            <QuickLink to="/training" icon={GraduationCap} label="Training modules" />
            <QuickLink to="/leads" icon={Briefcase} label="My leads" />
            <QuickLink to="/profile" icon={ListChecks} label="My profile" />
            <QuickLink to="/commissions" icon={DollarSign} label="View commissions" />
          </div>
        </Card>
      </div>
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
