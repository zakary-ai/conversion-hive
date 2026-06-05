import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listModules, listQuizQuestions, createQuestion, updateQuestion, deleteQuestion } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const modOpts = queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

export const Route = createFileRoute("/_authenticated/admin/quizzes")({
  loader: ({ context }) => context.queryClient.ensureQueryData(modOpts),
  component: AdminQuizzes,
});

type Question = Awaited<ReturnType<typeof listQuizQuestions>>[number];

function AdminQuizzes() {
  const { data: modules } = useSuspenseQuery(modOpts);
  const [moduleId, setModuleId] = useState<string>(modules[0]?.id ?? "");
  const qc = useQueryClient();

  const questions = useQuery({
    queryKey: ["questions", moduleId],
    queryFn: () => listQuizQuestions({ data: { module_id: moduleId } }),
    enabled: !!moduleId,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Quizzes" description="Manage questions per module." />
      <Card className="p-4">
        <Label>Module</Label>
        <Select value={moduleId} onValueChange={setModuleId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a module" /></SelectTrigger>
          <SelectContent>{modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
        </Select>
      </Card>

      {moduleId && <QuestionsList moduleId={moduleId} questions={questions.data ?? []} onChanged={() => qc.invalidateQueries({ queryKey: ["questions", moduleId] })} />}
    </div>
  );
}

function QuestionsList({ moduleId, questions, onChanged }: { moduleId: string; questions: Question[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Question | null>(null);
  const [open, setOpen] = useState(false);
  const del = useMutation({
    mutationFn: (id: string) => deleteQuestion({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); onChanged(); },
  });

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{questions.length} question{questions.length===1?"":"s"}</div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add question</Button>
      </div>

      <div className="space-y-2">
        {questions.length === 0 && <Card className="p-8 text-center text-muted-foreground">No questions yet.</Card>}
        {questions.map((q, i) => {
          const opts = (q.options as string[]) ?? [];
          return (
            <Card key={q.id} className="p-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Q{i + 1}</div>
                  <div className="font-medium">{q.question_text}</div>
                  <ul className="mt-2 text-sm space-y-0.5">
                    {opts.map((o, j) => (
                      <li key={j} className={j === q.correct_answer ? "text-success" : "text-muted-foreground"}>
                        {j === q.correct_answer ? "✓ " : "○ "}{o}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(q); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("Delete?") && del.mutate(q.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <QuestionDialog open={open} onOpenChange={setOpen} question={editing} moduleId={moduleId} onSaved={onChanged} />
    </>
  );
}

function QuestionDialog({ open, onOpenChange, question, moduleId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; question: Question | null; moduleId: string; onSaved: () => void }) {
  const [text, setText] = useState(question?.question_text ?? "");
  const [options, setOptions] = useState<string[]>((question?.options as string[]) ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState(question?.correct_answer ?? 0);
  const [lastId, setLastId] = useState(question?.id);
  if (question?.id !== lastId) {
    setLastId(question?.id);
    setText(question?.question_text ?? "");
    setOptions((question?.options as string[]) ?? ["", "", "", ""]);
    setCorrect(question?.correct_answer ?? 0);
  }

  const save = useMutation({
    mutationFn: async () => {
      const cleaned = options.filter((o) => o.trim()).map((o) => o.trim());
      const payload = { module_id: moduleId, question_text: text, options: cleaned, correct_answer: Math.min(correct, cleaned.length - 1) };
      if (question) await updateQuestion({ data: { ...payload, id: question.id } });
      else await createQuestion({ data: payload });
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{question ? "Edit question" : "New question"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Question</Label><Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div>
            <Label>Options (correct one is selected)</Label>
            <div className="space-y-2 mt-1">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="radio" checked={correct === i} onChange={() => setCorrect(i)} className="accent-primary" />
                  <Input value={o} onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? e.target.value : x))} placeholder={`Option ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={!text || options.filter((o) => o.trim()).length < 2 || save.isPending} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
