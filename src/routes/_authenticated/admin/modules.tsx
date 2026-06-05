import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listModules, createModule, updateModule, deleteModule } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

  const del = useMutation({
    mutationFn: (id: string) => deleteModule({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["modules"] }); },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Training modules" action={
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />New module
        </Button>
      } />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">#</th><th className="text-left p-3">Title</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {modules.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No modules.</td></tr>}
            {modules.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3 font-mono text-muted-foreground">{m.order_index}</td>
                <td className="p-3 font-medium">{m.title}</td>
                <td className="p-3 text-muted-foreground">{m.is_active ? "Yes" : "No"}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("Delete module?") && del.mutate(m.id)}><Trash2 className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ModuleDialog open={open} onOpenChange={setOpen} module={editing} />
    </div>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{m ? "Edit module" : "New module"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Video URL (YouTube/Vimeo)</Label><Input value={videoUrl ?? ""} onChange={(e) => setVideoUrl(e.target.value)} /></div>
          <div><Label>Order</Label><Input type="number" value={orderIndex} onChange={(e) => setOrderIndex(parseInt(e.target.value) || 0)} /></div>
          <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Active</Label></div>
          <Button onClick={() => save.mutate()} disabled={!title || save.isPending} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
