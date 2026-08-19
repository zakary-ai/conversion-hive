import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMyManagerModules, saveManagerModule, deleteManagerModule, createManagerVideoUploadUrl } from "@/lib/api/dm-manager.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Upload, Video } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/dm-manager/modules")({
  component: ManagerModulesPage,
});

type Module = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  order_index: number;
  is_active: boolean;
};

function ManagerModulesPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["my-manager-modules"], queryFn: () => listMyManagerModules() });
  const modules = data as Module[];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadVideo(file: File) {
    setUploading(true);
    try {
      const { path, token } = await createManagerVideoUploadUrl({ data: { filename: file.name } });
      const { error } = await supabase.storage.from("module-videos").uploadToSignedUrl(path, token, file, {
        contentType: file.type || "video/mp4",
      });
      if (error) throw error;
      setVideoPath(`storage:${path}`);
      toast.success("Video uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const create = useMutation({
    mutationFn: () =>
      saveManagerModule({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          video_url: videoPath,
          order_index: modules.length,
          is_active: true,
        },
      }),
    onSuccess: () => {
      toast.success("Module published to your team");
      setTitle(""); setDescription(""); setVideoPath(null);
      qc.invalidateQueries({ queryKey: ["my-manager-modules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteManagerModule({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["my-manager-modules"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (m: Module) =>
      saveManagerModule({
        data: {
          id: m.id, title: m.title, description: m.description, video_url: m.video_url,
          order_index: m.order_index, is_active: !m.is_active,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-manager-modules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-4">
      <div>
        <h1 className="text-2xl font-display font-semibold">My training modules</h1>
        <p className="text-sm text-muted-foreground">Only the DM setters on your team can see these.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">New module</div>
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How I open DMs" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Video</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild size="sm" variant="outline" disabled={uploading}>
              <label className="cursor-pointer">
                <Upload className="h-4 w-4 mr-1" />
                {uploading ? "Uploading…" : "Choose video"}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); }}
                />
              </label>
            </Button>
            {videoPath && <Badge variant="secondary" className="text-[10px]">Video ready</Badge>}
          </div>
        </div>
        <Button
          size="sm"
          disabled={!title.trim() || create.isPending || uploading}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Publishing…" : "Publish module"}
        </Button>
      </Card>

      <div className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && modules.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No modules yet.</Card>
        )}
        {modules.map((m) => (
          <Card key={m.id} className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                {m.title}
                {!m.is_active && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                {m.video_url && <Video className="h-3 w-3 text-muted-foreground" />}
              </div>
              {m.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{m.description}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="outline" onClick={() => toggle.mutate(m)}>
                {m.is_active ? "Hide" : "Show"}
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove.mutate(m.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
