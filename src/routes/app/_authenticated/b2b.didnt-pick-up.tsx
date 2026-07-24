import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyDidntPickUp } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";

const opts = queryOptions({
  queryKey: ["my-didnt-pick-up"],
  queryFn: () => listMyDidntPickUp(),
});

export const Route = createFileRoute("/app/_authenticated/b2b/didnt-pick-up")({
  head: () => ({ meta: [{ title: "Didn't Pick Up" }, { name: "description", content: "Leads to try again." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: DidntPickUpPage,
});

function DidntPickUpPage() {
  const { data: leads } = useSuspenseQuery(opts);
  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Didn't Pick Up" description={`${leads.length} to try again — oldest attempts first`} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Last attempt</th>
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
                <td className="p-3">{l.last_attempt_at ? new Date(l.last_attempt_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!leads.length && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nothing here yet. Great — everyone picked up.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
