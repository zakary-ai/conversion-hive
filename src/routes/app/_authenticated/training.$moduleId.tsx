import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  getModule,
  markModuleComplete,
  listQuizQuestions,
  listMyAttempts,
  submitQuiz,
  listModules,
  getMyModuleNote,
  upsertMyModuleNote,
} from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/_authenticated/training/$moduleId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(mOpts(params.moduleId)),
      context.queryClient.ensureQueryData(qOpts(params.moduleId)),
      context.queryClient.ensureQueryData(aOpts(params.moduleId)),
      context.queryClient.ensureQueryData(nOpts(params.moduleId)),
      context.queryClient.ensureQueryData(listOpts()),
    ]),
  component: ModulePage,
});

const mOpts = (id: string) => queryOptions({ queryKey: ["module", id], queryFn: () => getModule({ data: { id } }) });
const qOpts = (id: string) => queryOptions({ queryKey: ["questions", id], queryFn: () => listQuizQuestions({ data: { module_id: id } }) });
const aOpts = (id: string) => queryOptions({ queryKey: ["attempts", id], queryFn: () => listMyAttempts({ data: { module_id: id } }) });
const nOpts = (id: string) => queryOptions({ queryKey: ["my-note", id], queryFn: () => getMyModuleNote({ data: { module_id: id } }) });
const listOpts = () => queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

function getEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function VideoPlayer({ url, title }: { url: string | null; title: string }) {
  const isStorage = !!url && url.startsWith("storage:");
  const storagePath = isStorage ? url!.slice(8) : null;

  const { data: signedUrl } = useQuery({
    queryKey: ["module-video-signed", storagePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("module-videos")
        .createSignedUrl(storagePath!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!storagePath,
    staleTime: 50 * 60 * 1000,
  });

  if (!url) return null;

  if (isStorage) {
    if (!signedUrl) {
      return (
        <Card className="overflow-hidden">
          <div className="aspect-video bg-black flex items-center justify-center text-muted-foreground text-sm">
            Loading video…
          </div>
        </Card>
      );
    }
    return (
      <Card className="overflow-hidden">
        <video src={signedUrl} controls className="w-full aspect-video bg-black" />
      </Card>
    );
  }

  const embed = getEmbedUrl(url);
  if (embed) {
    return (
      <Card className="overflow-hidden">
        <div className="aspect-video bg-black">
          <iframe
            src={embed}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <video src={url} controls className="w-full aspect-video bg-black" />
    </Card>
  );
}

const MIN_NOTE_CHARS = 100;

function ModulePage() {
  const { moduleId } = Route.useParams();
  const navigate = useNavigate();
  const { data: m } = useSuspenseQuery(mOpts(moduleId));
  const { data: questions } = useSuspenseQuery(qOpts(moduleId));
  const { data: attempts } = useSuspenseQuery(aOpts(moduleId));
  const { data: savedNote } = useSuspenseQuery(nOpts(moduleId));
  const { data: allModules } = useSuspenseQuery(listOpts());
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; total: number; correct: number } | null>(null);
  const [notes, setNotes] = useState(savedNote.content ?? "");

  useEffect(() => {
    setNotes(savedNote.content ?? "");
    setAnswers({});
    setResult(null);
  }, [moduleId, savedNote.content]);

  const { prev, next } = useMemo(() => {
    const idx = allModules.findIndex((x) => x.id === moduleId);
    return {
      prev: idx > 0 ? allModules[idx - 1] : null,
      next: idx >= 0 && idx < allModules.length - 1 ? allModules[idx + 1] : null,
    };
  }, [allModules, moduleId]);

  const saveNote = useMutation({
    mutationFn: (content: string) => upsertMyModuleNote({ data: { module_id: moduleId, content } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-note", moduleId] });
    },
  });

  // Autosave (debounced)
  useEffect(() => {
    if (notes === (savedNote.content ?? "")) return;
    const t = setTimeout(() => saveNote.mutate(notes), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const complete = useMutation({
    mutationFn: async () => {
      if (notes !== (savedNote.content ?? "")) {
        await upsertMyModuleNote({ data: { module_id: moduleId, content: notes } });
      }
      return markModuleComplete({ data: { module_id: moduleId } });
    },
    onSuccess: () => {
      toast.success("Module marked complete");
      qc.invalidateQueries({ queryKey: ["module", moduleId] });
      qc.invalidateQueries({ queryKey: ["modules"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  const noteChars = notes.trim().length;
  const noteOk = noteChars >= MIN_NOTE_CHARS;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title={m.title} description={`Module ${m.order_index}`} action={
        <Button variant="ghost" asChild><Link to="/app/training">← All modules</Link></Button>
      } />

      <VideoPlayer url={m.video_url} title={m.title} />

      <Card className="p-6 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display font-semibold text-lg">Your notes</h2>
          <span className={`text-xs ${noteOk ? "text-muted-foreground" : "text-destructive"}`}>
            {noteChars}/{MIN_NOTE_CHARS} characters
          </span>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Write your notes from the video here. At least 100 characters required to mark this module complete."
          className="min-h-[180px]"
        />
        <p className="text-xs text-muted-foreground">
          {saveNote.isPending ? "Saving…" : "Autosaved"}
        </p>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => complete.mutate()}
          disabled={m.completed || complete.isPending || !noteOk}
        >
          {m.completed ? <><CheckCircle2 className="h-4 w-4 mr-2" />Completed</> : "Mark as complete"}
        </Button>
        {!noteOk && !m.completed && (
          <span className="text-xs text-muted-foreground self-center">
            Write {MIN_NOTE_CHARS - noteChars} more character{MIN_NOTE_CHARS - noteChars === 1 ? "" : "s"} to unlock.
          </span>
        )}
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

      <div className="flex justify-between items-center gap-3 pt-6 border-t border-border">
        <Button
          variant="outline"
          disabled={!prev}
          onClick={() => prev && navigate({ to: "/app/training/$moduleId", params: { moduleId: prev.id } })}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {prev ? `Module ${prev.order_index}` : "Previous"}
        </Button>
        <Button
          variant="outline"
          disabled={!next}
          onClick={() => next && navigate({ to: "/app/training/$moduleId", params: { moduleId: next.id } })}
        >
          {next ? `Module ${next.order_index}` : "Next"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
