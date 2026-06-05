import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listModules } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, CheckCircle2 } from "lucide-react";

const opts = queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

export const Route = createFileRoute("/_authenticated/training/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: TrainingList,
});

function TrainingList() {
  const { data: modules } = useSuspenseQuery(opts);
  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="Training" description="Master the Conversion Lab playbook, module by module." />
      {modules.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No modules published yet.</Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m) => (
            <Link key={m.id} to="/training/$moduleId" params={{ moduleId: m.id }}>
              <Card className="p-5 h-full hover:border-primary/50 transition-colors group">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="secondary" className="font-mono">#{String(m.order_index).padStart(2,"0")}</Badge>
                  {m.completed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" />Done</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Play className="h-3 w-3" />Start</span>
                  )}
                </div>
                <h3 className="font-display font-semibold text-lg group-hover:text-primary transition-colors">{m.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{m.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
