import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyCallbacks } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const opts = queryOptions({
  queryKey: ["my-callbacks"],
  queryFn: () => listMyCallbacks(),
});

export const Route = createFileRoute("/app/_authenticated/b2b/callbacks")({
  head: () => ({ meta: [{ title: "Callbacks" }, { name: "description", content: "Your scheduled callbacks." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: CallbacksPage,
});

function CallbacksPage() {
  const { data: rows } = useSuspenseQuery(opts);
  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.scheduled_at).getTime() >= now);
  const past = rows.filter((r) => new Date(r.scheduled_at).getTime() < now);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Callbacks" description={`${upcoming.length} upcoming · ${past.length} past`} />

      <Section title="Upcoming" rows={upcoming} empty="Nothing scheduled." />
      <Section title="Past" rows={past} empty="No past callbacks." />
    </div>
  );
}

function Section({
  title, rows, empty,
}: { title: string; rows: Awaited<ReturnType<typeof listMyCallbacks>>; empty: string }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => {
            const lead: any = (r as any).lead;
            const name = lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.company || "—" : "—";
            return (
              <li key={r.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <div>
                  <div className="font-medium">
                    {lead ? (
                      <Link to="/app/b2b/leads/$id" params={{ id: lead.id }} className="hover:underline">{name}</Link>
                    ) : name}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.scheduled_at).toLocaleString()}</div>
                  {r.note && <div className="text-xs mt-1">{r.note}</div>}
                </div>
                <Badge variant="outline">{r.status}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
