import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getModule,
  markModuleComplete,
  listQuizQuestions,
  listMyAttempts,
  submitQuiz,
} from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/training/$moduleId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(mOpts(params.moduleId)),
      context.queryClient.ensureQueryData(qOpts(params.moduleId)),
      context.queryClient.ensureQueryData(aOpts(params.moduleId)),
    ]),
  component: ModulePage,
});

const mOpts = (id: string) => queryOptions({ queryKey: ["module", id], queryFn: () => getModule({ data: { id } }) });
const qOpts = (id: string) => queryOptions({ queryKey: ["questions", id], queryFn: () => listQuizQuestions({ data: { module_id: id } }) });
const aOpts = (id: string) => queryOptions({ queryKey: ["attempts", id], queryFn: () => listMyAttempts({ data: { module_id: id } }) });

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
  const { data: m } = useSuspenseQuery(mOpts(moduleId));
  const { data: questions } = useSuspenseQuery(qOpts(moduleId));
  const { data: attempts } = useSuspenseQuery(aOpts(moduleId));
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; total: number; correct: number } | null>(null);

  const complete = useMutation({
    mutationFn: () => markModuleComplete({ data: { module_id: moduleId } }),
    onSuccess: () => {
      toast.success("Module marked complete");
      qc.invalidateQueries({ queryKey: ["module", moduleId] });
      qc.invalidateQueries({ queryKey: ["modules"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
  });

  const submit = useMutation({
    mutationFn: () => submitQuiz({ data: { module_id: moduleId, answers: questions.map((_, i) => answers[i] ?? -1) } }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Score: ${res.score}%`);
      qc.invalidateQueries({ queryKey: ["attempts", moduleId] });
    },
  });

  const reset = () => { setAnswers({}); setResult(null); };
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
      </div>

      <div className="pt-2">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-semibold text-xl">Quiz</h2>
          <span className="text-xs text-muted-foreground">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </span>
        </div>

        {questions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No questions for this module yet.</Card>
        ) : result ? (
          <Card className="p-6 text-center space-y-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Your score</div>
            <div className="text-6xl font-display font-semibold text-primary">{result.score}%</div>
            <div className="text-sm text-muted-foreground">{result.correct} of {result.total} correct</div>
            <Button onClick={reset}>Retake quiz</Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => {
              const options = (q.options as string[]) ?? [];
              return (
                <Card key={q.id} className="p-5">
                  <div className="text-xs text-muted-foreground mb-1">Question {i + 1}</div>
                  <h3 className="font-medium mb-4">{q.question_text}</h3>
                  <RadioGroup
                    value={answers[i]?.toString() ?? ""}
                    onValueChange={(v) => setAnswers((a) => ({ ...a, [i]: parseInt(v) }))}
                  >
                    {options.map((opt, j) => (
                      <div key={j} className="flex items-center space-x-2 rounded-md border border-border px-3 py-2 hover:bg-muted/40">
                        <RadioGroupItem value={j.toString()} id={`${q.id}-${j}`} />
                        <Label htmlFor={`${q.id}-${j}`} className="flex-1 cursor-pointer font-normal">{opt}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </Card>
              );
            })}
            <Button
              onClick={() => submit.mutate()}
              disabled={Object.keys(answers).length !== questions.length || submit.isPending}
              className="w-full"
            >
              Submit quiz
            </Button>
          </div>
        )}

        {attempts.length > 0 && (
          <Card className="p-5 mt-4">
            <h3 className="font-display font-semibold mb-3">Previous attempts</h3>
            <div className="space-y-2">
              {attempts.map((a) => (
                <div key={a.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{new Date(a.completed_at).toLocaleString()}</span>
                  <span className="font-medium">{a.score}%</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
