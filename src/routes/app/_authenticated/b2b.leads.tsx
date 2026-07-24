import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyClaimedLeads } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const opts = queryOptions({
  queryKey: ["my-claimed-leads"],
  queryFn: () => listMyClaimedLeads(),
});

export const Route = createFileRoute("/app/_authenticated/b2b/leads")({
  head: () => ({ meta: [{ title: "My Leads" }, { name: "description", content: "Leads you've claimed from the pool." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: MyLeadsPage,
});

function MyLeadsPage() {
  const { data: leads } = useSuspenseQuery(opts);
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="My leads" description={`${leads.length} claimed`} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Email</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3">
                  <Link to="/app/b2b/leads/$id" params={{ id: l.id }} className="font-medium underline-offset-2 hover:underline">
                    {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                  </Link>
                </td>
                <td className="p-3">{l.company || "—"}</td>
                <td className="p-3">{l.phone || "—"}</td>
                <td className="p-3">{l.email || "—"}</td>
                <td className="p-3"><Badge variant={l.status === "booked" ? "default" : "secondary"}>{l.status}</Badge></td>
              </tr>
            ))}
            {!leads.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                No claimed leads yet. Head to <Link to="/app/b2b/pool" className="underline">Lead Pool</Link> to claim some.
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
