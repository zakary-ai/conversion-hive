import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listClients } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";

const opts = queryOptions({ queryKey: ["clients"], queryFn: () => listClients() });

export const Route = createFileRoute("/_authenticated/admin/clients/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: ClientsList,
});

function ClientsList() {
  const { data: clients } = useSuspenseQuery(opts);
  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Clients" description={`${clients.length} active`} />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3 hidden md:table-cell">Company</th><th className="text-left p-3">Joined</th></tr>
          </thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No clients yet. New signups appear here.</td></tr>}
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3 font-medium">
                  <Link to="/admin/clients/$userId" params={{ userId: c.user_id }} className="hover:text-primary">
                    {c.full_name || "—"}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground">{c.email}</td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">{c.company_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
