import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listModules } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, CheckCircle2 } from "lucide-react";

const opts = queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

export const Route = createFileRoute("/app/_authenticated/training/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: TrainingList,
});

function TrainingList() {
  const { data: modules } = useSuspenseQuery(opts);
  const total = modules.length;
  const done = modules.filter((m: any) => m.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="Training" description="Master the Conversion Lab playbook, module by module." />
      {total > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Your progress</span>
            <span className="text-sm text-muted-foreground">{done} of {total} modules • {pct}%</span>
          </div>
          <Progress value={pct} />
        </Card>
      )}
      {total === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No modules published yet.</Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m) => (
            <Link key={m.id} to="/app/training/$moduleId" params={{ moduleId: m.id }}>
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
