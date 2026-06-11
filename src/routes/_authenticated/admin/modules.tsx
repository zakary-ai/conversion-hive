import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listModules, createModule, updateModule, deleteModule, reorderModules, generateQuizFromTranscript } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Loader2, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const opts = queryOptions({ queryKey: ["modules"], queryFn: () => listModules() });

export const Route = createFileRoute("/_authenticated/admin/modules")({
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

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const next = modules.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const order = next.map((m, i) => ({ id: m.id, order_index: i }));
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

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3 w-24">Order</th><th className="text-left p-3">Title</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {modules.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No modules.</td></tr>}
            {modules.map((m, i) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" disabled={i === modules.length - 1 || reorder.isPending} onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></Button>
                    <span className="font-mono text-muted-foreground ml-1">{m.order_index}</span>
                  </div>
                </td>
                <td className="p-3 font-medium">{m.title}</td>
                <td className="p-3 text-muted-foreground">{m.is_active ? "Yes" : "No"}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" title="Generate quiz from transcript" onClick={() => setQuizFor(m)}><Sparkles className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("Delete module?") && del.mutate(m.id)}><Trash2 className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ModuleDialog open={open} onOpenChange={setOpen} module={editing} />
      <TranscriptQuizDialog module={quizFor} onOpenChange={(o) => !o && setQuizFor(null)} />
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

  const save = useMutation({
    mutationFn: async () => {
      const payload = { title, description, video_url: videoUrl, order_index: orderIndex, is_active: isActive };
      if (m) await updateModule({ data: { ...payload, id: m.id } });
      else await createModule({ data: payload });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{m ? "Edit module" : "New module"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
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
          <Button onClick={() => save.mutate()} disabled={!title || save.isPending || uploading} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
