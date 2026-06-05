import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getAdminDashboard } from "@/lib/api/cl.functions";
import { PageHeader, StatCard, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Users, Briefcase, CheckCircle2, DollarSign, ArrowRight, BookOpen, ListChecks } from "lucide-react";

const opts = queryOptions({ queryKey: ["admin-dashboard"], queryFn: () => getAdminDashboard() });

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data } = useSuspenseQuery(opts);
  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="Admin overview" description="Pipeline health across all clients." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total clients" value={data.totalClients} icon={Users} />
        <StatCard label="Total leads" value={data.totalLeads} icon={Briefcase} />
        <StatCard label="Contacted today" value={data.contactedToday} icon={CheckCircle2} />
        <StatCard label="Total commissions" value={`$${data.totalCommissions.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={DollarSign} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-2">
          <h3 className="font-display font-semibold mb-4">Recent leads</h3>
          <div className="space-y-2">
            {data.recentLeads.length === 0 && <div className="text-sm text-muted-foreground">No leads yet.</div>}
            {data.recentLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <div>
                  <div className="font-medium text-sm">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </div>
                <StatusPill status={l.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-semibold mb-3">Quick links</h3>
          <div className="space-y-2">
            {[
              { to: "/admin/clients", icon: Users, label: "Manage clients" },
              { to: "/admin/modules", icon: BookOpen, label: "Modules" },
              { to: "/admin/quizzes", icon: ListChecks, label: "Quizzes" },
              { to: "/admin/leads", icon: Briefcase, label: "Leads" },
              { to: "/admin/commissions", icon: DollarSign, label: "Commissions" },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 group">
                <span className="flex items-center gap-2 text-sm"><q.icon className="h-4 w-4 text-primary" />{q.label}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
