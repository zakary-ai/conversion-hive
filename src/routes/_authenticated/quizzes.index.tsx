import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listModules } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const opts = queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

export const Route = createFileRoute("/_authenticated/quizzes/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: QuizList,
});

function QuizList() {
  const { data: modules } = useSuspenseQuery(opts);
  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="Quizzes" description="Test what you've learned. Retake any quiz to improve." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Module {m.order_index}</div>
            <h3 className="font-display font-semibold text-lg mt-1">{m.title}</h3>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/quizzes/$moduleId" params={{ moduleId: m.id }}>Take quiz <ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
