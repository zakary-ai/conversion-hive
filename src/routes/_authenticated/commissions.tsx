import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyCommissions } from "@/lib/api/cl.functions";
import { PageHeader, StatCard } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

const opts = queryOptions({ queryKey: ["my-commissions"], queryFn: () => listMyCommissions() });

export const Route = createFileRoute("/_authenticated/commissions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: CommissionsPage,
});

function CommissionsPage() {
  const { data: entries } = useSuspenseQuery(opts);
  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Commissions" description="Your earnings and entries logged by your team." />
      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard label="Total earned" value={`$${total.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={DollarSign} />
        <StatCard label="Entries" value={entries.length} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Note</th></tr>
          </thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No commissions yet.</td></tr>}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</td>
                <td className="p-3 font-medium text-success">${Number(e.amount).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                <td className="p-3 text-muted-foreground">{e.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
