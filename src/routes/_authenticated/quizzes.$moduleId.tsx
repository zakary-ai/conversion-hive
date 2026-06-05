import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listQuizQuestions, listMyAttempts, submitQuiz, getModule } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quizzes/$moduleId")({
  loader: ({ context, params }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(qOpts(params.moduleId)),
      context.queryClient.ensureQueryData(mOpts(params.moduleId)),
      context.queryClient.ensureQueryData(aOpts(params.moduleId)),
    ]);
  },
  component: QuizPage,
});

const qOpts = (id: string) => queryOptions({ queryKey: ["questions", id], queryFn: () => listQuizQuestions({ data: { module_id: id } }) });
const mOpts = (id: string) => queryOptions({ queryKey: ["module", id], queryFn: () => getModule({ data: { id } }) });
const aOpts = (id: string) => queryOptions({ queryKey: ["attempts", id], queryFn: () => listMyAttempts({ data: { module_id: id } }) });

function QuizPage() {
  const { moduleId } = Route.useParams();
  const { data: questions } = useSuspenseQuery(qOpts(moduleId));
  const { data: m } = useSuspenseQuery(mOpts(moduleId));
  const { data: attempts } = useSuspenseQuery(aOpts(moduleId));
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; total: number; correct: number } | null>(null);

  const submit = useMutation({
    mutationFn: () => submitQuiz({ data: { module_id: moduleId, answers: questions.map((_, i) => answers[i] ?? -1) } }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Score: ${res.score}%`);
      qc.invalidateQueries({ queryKey: ["attempts", moduleId] });
    },
  });

  const reset = () => { setAnswers({}); setResult(null); };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={`Quiz: ${m.title}`} description={`${questions.length} question${questions.length===1?"":"s"}`} action={
        <Button variant="ghost" asChild><Link to="/quizzes">← All quizzes</Link></Button>
      } />

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
        <Card className="p-5">
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
  );
}
