import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listModules, createModule, updateModule, deleteModule, reorderModules, generateQuizFromTranscript, generateModuleMetaFromTranscript } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Loader2, Sparkles, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const opts = queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

export const Route = createFileRoute("/app/_authenticated/admin/modules")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: AdminModules,
});

type Module = Awaited<ReturnType<typeof listModules>>[number];

function AdminModules() {
  const { data: modules } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Module | null>(null);
  const [open, setOpen] = useState(false);
  const [quizFor, setQuizFor] = useState<Module | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteModule({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["modules"] }); },
  });

  const reorder = useMutation({
    mutationFn: (order: { id: string; order_index: number }[]) => reorderModules({ data: { order } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(modules, oldIndex, newIndex);
    const order = next.map((m, i) => ({ id: m.id, order_index: i }));
    qc.setQueryData(["modules"], next.map((m, i) => ({ ...m, order_index: i })));
    reorder.mutate(order);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Training modules" action={
        <div className="flex gap-2">
          <BulkUpload nextOrder={(modules[modules.length - 1]?.order_index ?? -1) + 1} />
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />New module
          </Button>
        </div>
      } />

      <Card className="overflow-x-auto">
        <div className="grid grid-cols-[40px_80px_1fr_80px_140px] gap-2 px-3 py-2 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
          <div></div><div>Order</div><div>Title</div><div>Active</div><div></div>
        </div>
        {modules.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No modules.</div>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {modules.map((m) => (
              <SortableRow
                key={m.id}
                module={m}
                onEdit={() => { setEditing(m); setOpen(true); }}
                onDelete={() => confirm("Delete module?") && del.mutate(m.id)}
                onQuiz={() => setQuizFor(m)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </Card>

      <ModuleDialog open={open} onOpenChange={setOpen} module={editing} />
      <TranscriptQuizDialog module={quizFor} onOpenChange={(o) => !o && setQuizFor(null)} />
    </div>
  );
}

function SortableRow({ module: m, onEdit, onDelete, onQuiz }: { module: Module; onEdit: () => void; onDelete: () => void; onQuiz: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[40px_80px_1fr_80px_140px] gap-2 px-3 py-3 items-center border-t border-border text-sm bg-background">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="font-mono text-muted-foreground">{m.order_index}</div>
      <div className="font-medium truncate">{m.title}</div>
      <div className="text-muted-foreground">{m.is_active ? "Yes" : "No"}</div>
      <div className="text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" title="Generate quiz from transcript" onClick={onQuiz}><Sparkles className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function BulkUpload({ nextOrder }: { nextOrder: number }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    let order = nextOrder;
    let failures = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const ext = file.name.split(".").pop() || "mp4";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("module-videos").upload(path, file, {
          contentType: file.type || "video/mp4",
          upsert: false,
        });
        if (upErr) throw upErr;
        const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || `Module ${order + 1}`;
        await createModule({ data: { title, description: "", video_url: `storage:${path}`, order_index: order, is_active: true } });
        order++;
      } catch (e) {
        failures++;
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["modules"] });
    if (failures === 0) toast.success(`Uploaded ${files.length} module${files.length === 1 ? "" : "s"}`);
    else toast.warning(`Completed with ${failures} failure(s)`);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-input cursor-pointer hover:bg-accent">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      {busy ? `Uploading ${progress.done}/${progress.total}…` : "Bulk upload"}
      <input
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </label>
  );
}

function TranscriptQuizDialog({ module: m, onOpenChange }: { module: Module | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [transcript, setTranscript] = useState("");
  const [count, setCount] = useState(5);
  const [replace, setReplace] = useState(false);

  const gen = useMutation({
    mutationFn: () => generateQuizFromTranscript({ data: { module_id: m!.id, transcript, count, replace } }),
    onSuccess: (res) => {
      toast.success(`Generated ${res.inserted} question${res.inserted === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["questions", m!.id] });
      setTranscript("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleFile(file: File) {
    const text = await file.text();
    setTranscript(text);
  }

  return (
    <Dialog open={!!m} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Generate quiz — {m?.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Transcript</Label>
            <Textarea rows={10} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste transcript text or upload a .txt/.vtt/.srt file…" />
            <div className="mt-2">
              <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-input cursor-pointer hover:bg-accent">
                <Upload className="h-4 w-4" />
                Upload transcript file
                <input type="file" accept=".txt,.vtt,.srt,.md,text/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{transcript.length.toLocaleString()} characters</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>How many questions</Label>
              <Input type="number" min={1} max={15} value={count} onChange={(e) => setCount(Math.max(1, Math.min(15, parseInt(e.target.value) || 5)))} />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={replace} onCheckedChange={setReplace} />
              <Label className="mb-2">Replace existing questions</Label>
            </div>
          </div>
          <Button onClick={() => gen.mutate()} disabled={transcript.length < 50 || gen.isPending} className="w-full">
            {gen.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : <><Sparkles className="h-4 w-4 mr-2" />Generate quiz</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModuleDialog({ open, onOpenChange, module: m }: { open: boolean; onOpenChange: (o: boolean) => void; module: Module | null }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(m?.title ?? "");
  const [description, setDescription] = useState(m?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(m?.video_url ?? "");
  const [orderIndex, setOrderIndex] = useState(m?.order_index ?? 0);
  const [isActive, setIsActive] = useState(m?.is_active ?? true);

  // Reset when m changes
  const [lastId, setLastId] = useState(m?.id);
  if (m?.id !== lastId) {
    setLastId(m?.id);
    setTitle(m?.title ?? "");
    setDescription(m?.description ?? "");
    setVideoUrl(m?.video_url ?? "");
    setOrderIndex(m?.order_index ?? 0);
    setIsActive(m?.is_active ?? true);
  }

  const [transcript, setTranscript] = useState("");
  const [transcriptName, setTranscriptName] = useState<string | null>(null);
  const [autoGen, setAutoGen] = useState(!m);
  const [quizCount, setQuizCount] = useState(5);
  const [generating, setGenerating] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      let finalTitle = title;
      let finalDescription = description;

      // For new modules with a transcript + autoGen, generate title/description first
      if (!m && autoGen && transcript.length >= 50 && (!finalTitle || !finalDescription)) {
        setGenerating(true);
        try {
          const meta = await generateModuleMetaFromTranscript({ data: { transcript } });
          if (!finalTitle) { finalTitle = meta.title; setTitle(meta.title); }
          if (!finalDescription) { finalDescription = meta.description; setDescription(meta.description); }
        } finally {
          setGenerating(false);
        }
      }

      const payload = { title: finalTitle, description: finalDescription, video_url: videoUrl, order_index: orderIndex, is_active: isActive };
      let moduleId = m?.id;
      if (m) {
        await updateModule({ data: { ...payload, id: m.id } });
      } else {
        const row = await createModule({ data: payload });
        moduleId = (row as { id: string }).id;
      }

      // Generate quiz from transcript for new modules
      if (!m && autoGen && transcript.length >= 50 && moduleId) {
        setGenerating(true);
        try {
          await generateQuizFromTranscript({ data: { module_id: moduleId, transcript, count: quizCount, replace: false } });
        } catch (e) {
          toast.warning(`Module created but quiz generation failed: ${(e as Error).message}`);
        } finally {
          setGenerating(false);
        }
      }
    },
    onSuccess: () => {
      toast.success(m ? "Updated" : "Created");
      qc.invalidateQueries({ queryKey: ["modules"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("module-videos").upload(path, file, {
        contentType: file.type || "video/mp4",
        upsert: false,
      });
      if (error) throw error;
      setVideoUrl(`storage:${path}`);
      toast.success("Video uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleTranscriptFile(file: File) {
    try {
      const text = await file.text();
      setTranscript(text);
      setTranscriptName(file.name);
      toast.success("Transcript loaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const busy = save.isPending || generating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{m ? "Edit module" : "New module"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!m && (
            <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Transcript (auto-generate title, description & quiz)</Label>
                <div className="flex items-center gap-2">
                  <Switch checked={autoGen} onCheckedChange={setAutoGen} />
                  <span className="text-xs text-muted-foreground">Auto</span>
                </div>
              </div>
              <Textarea
                rows={4}
                value={transcript}
                onChange={(e) => { setTranscript(e.target.value); if (!e.target.value) setTranscriptName(null); }}
                placeholder="Paste transcript text or upload a .txt/.vtt/.srt file…"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-input cursor-pointer hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  Upload transcript
                  <input
                    type="file"
                    accept=".txt,.vtt,.srt,.md,text/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleTranscriptFile(e.target.files[0])}
                  />
                </label>
                {transcriptName && <span className="text-xs text-muted-foreground truncate">{transcriptName}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{transcript.length.toLocaleString()} chars</span>
              </div>
              {autoGen && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Quiz questions:</Label>
                  <Input
                    type="number"
                    min={1}
                    max={15}
                    value={quizCount}
                    onChange={(e) => setQuizCount(Math.max(1, Math.min(15, parseInt(e.target.value) || 5)))}
                    className="w-20 h-8"
                  />
                </div>
              )}
            </div>
          )}
          <div>
            <Label>Title {!m && autoGen && transcript.length >= 50 && !title && <span className="text-xs text-muted-foreground">(auto-generated on save)</span>}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description {!m && autoGen && transcript.length >= 50 && !description && <span className="text-xs text-muted-foreground">(auto-generated on save)</span>}</Label>
            <Textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Video</Label>
            <div className="space-y-2">
              <Input
                placeholder="YouTube/Vimeo URL or upload below"
                value={videoUrl ?? ""}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-input cursor-pointer hover:bg-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Upload video file"}
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  />
                </label>
                {videoUrl?.startsWith("storage:") && (
                  <span className="text-xs text-muted-foreground truncate">Uploaded: {videoUrl.slice(8)}</span>
                )}
              </div>
            </div>
          </div>
          <div><Label>Order</Label><Input type="number" value={orderIndex} onChange={(e) => setOrderIndex(parseInt(e.target.value) || 0)} /></div>
          <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Active</Label></div>
          <Button
            onClick={() => save.mutate()}
            disabled={busy || uploading || (!m && autoGen && transcript.length < 50 && !title) || (!(!m && autoGen && transcript.length >= 50) && !title)}
            className="w-full"
          >
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : save.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
