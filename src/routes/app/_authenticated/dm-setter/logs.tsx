import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logDmScreenshots, getMyDmStats } from "@/lib/api/dm-setters.functions";
import { toast } from "sonner";
import { Loader2, Upload, ImagePlus, X } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/dm-setter/logs")({
  component: DmLogsPage,
});

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function DmLogsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-dm-stats"], queryFn: () => getMyDmStats() });
  const [files, setFiles] = useState<File[]>([]);
  const libraryRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => [...prev, ...incoming].slice(0, 50));
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const upload = useMutation({
    mutationFn: async () => {
      const images = await Promise.all(files.map(fileToDataUrl));
      return logDmScreenshots({ data: { images } });
    },
    onSuccess: (r) => {
      const parts = [`+${r.added} DM${r.added === 1 ? "" : "s"} · today ${r.total_today}`];
      if (r.duplicates_skipped > 0) parts.push(`${r.duplicates_skipped} duplicate${r.duplicates_skipped === 1 ? "" : "s"} skipped`);
      toast.success(parts.join(" · "));
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["my-dm-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalToday = (data?.todayLog?.ai_count ?? 0) + (data?.todayLog?.manual_adjustment ?? 0);
  const target = data?.dmSetter?.daily_target ?? 100;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Log DMs</h1>
        <p className="text-sm text-muted-foreground">Upload screenshots and AI will count outbound DMs and detect the platform.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Today: {totalToday} / {target}</CardTitle></CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Upload screenshots</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={libraryRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => libraryRef.current?.click()}>
              <ImagePlus className="h-4 w-4 mr-2" /> Choose from library
            </Button>
          </div>
          {files.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map((f, i) => {
                const url = URL.createObjectURL(f);
                return (
                  <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-border">
                    <img src={url} alt="preview" className="w-full h-full object-cover" onLoad={() => URL.revokeObjectURL(url)} />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 rounded-full bg-background/80 p-1 text-foreground hover:bg-background"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {files.length}/50 selected · No daily limit — upload as many screenshots as you like. AI will detect whether the screenshot is from Instagram, TikTok, or another platform.
          </div>
          <Button onClick={() => upload.mutate()} disabled={!files.length || upload.isPending} className="w-full sm:w-auto">
            {upload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Submit
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients logged ({data?.recipientTotal ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            AI extracts recipient usernames from your screenshots. Duplicates are automatically skipped so the same person is never counted twice.
          </p>
          {(data?.recipients ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No recipients logged yet.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
              {(data?.recipients ?? []).map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs"
                  title={new Date(r.created_at).toLocaleString()}
                >
                  {r.name_original}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent days</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {(data?.recentLogs ?? []).map((l) => (
              <div key={l.id} className="flex justify-between border-b border-border/60 py-1">
                <span>{l.log_date}</span>
                <span className="tabular-nums">{(l.ai_count ?? 0) + (l.manual_adjustment ?? 0)} / {l.target ?? 100}</span>
              </div>
            ))}
            {(!data?.recentLogs || data.recentLogs.length === 0) && (
              <div className="text-muted-foreground">No logs yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
