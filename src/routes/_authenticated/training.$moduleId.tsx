import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getModule, markModuleComplete } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/training/$moduleId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(opts(params.moduleId)),
  component: ModulePage,
});

const opts = (id: string) => queryOptions({
  queryKey: ["module", id],
  queryFn: () => getModule({ data: { id } }),
});

function getEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

function ModulePage() {
  const { moduleId } = Route.useParams();
  const { data: m } = useSuspenseQuery(opts(moduleId));
  const qc = useQueryClient();
  const navigate = useNavigate();

  const complete = useMutation({
    mutationFn: () => markModuleComplete({ data: { module_id: moduleId } }),
    onSuccess: () => {
      toast.success("Module marked complete");
      qc.invalidateQueries({ queryKey: ["module", moduleId] });
      qc.invalidateQueries({ queryKey: ["modules"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
  });

  const embed = getEmbedUrl(m.video_url);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title={m.title} description={`Module ${m.order_index}`} action={
        <Button variant="ghost" asChild><Link to="/training">← All modules</Link></Button>
      } />

      {embed && (
        <Card className="overflow-hidden">
          <div className="aspect-video bg-black">
            <iframe
              src={embed}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={m.title}
            />
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg mb-3">Module notes</h2>
        <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap text-muted-foreground">
          {m.description || "No description provided."}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => complete.mutate()} disabled={m.completed || complete.isPending}>
          {m.completed ? <><CheckCircle2 className="h-4 w-4 mr-2" />Completed</> : "Mark as complete"}
        </Button>
        <Button variant="outline" onClick={() => navigate({ to: "/quizzes/$moduleId", params: { moduleId } })}>
          <ListChecks className="h-4 w-4 mr-2" />Take quiz
        </Button>
      </div>
    </div>
  );
}
