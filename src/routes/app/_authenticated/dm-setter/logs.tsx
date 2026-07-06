import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logDmScreenshots, getMyDmStats, adjustDmDailyLog } from "@/lib/api/dm-setters.functions";
import { toast } from "sonner";
import { Loader2, Upload, Minus, Plus, Camera, ImagePlus, X } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/dm-setter/logs")({
  component: DmLogsPage,
});

type Platform = "instagram" | "tiktok" | "other";

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
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [files, setFiles] = useState<File[]>([]);

  const upload = useMutation({
    mutationFn: async () => {
      const images = await Promise.all(files.map(fileToDataUrl));
      return logDmScreenshots({ data: { platform, images } });
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

  const adjust = useMutation({
    mutationFn: (delta: number) => adjustDmDailyLog({ data: { delta } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-dm-stats"] }),
  });

  const totalToday = (data?.todayLog?.ai_count ?? 0) + (data?.todayLog?.manual_adjustment ?? 0);
  const target = data?.dmSetter?.daily_target ?? 100;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Log DMs</h1>
        <p className="text-sm text-muted-foreground">Upload screenshots and AI will count outbound DMs.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Today: {totalToday} / {target}</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => adjust.mutate(-1)}><Minus className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => adjust.mutate(1)}><Plus className="h-4 w-4" /></Button>
          <div className="text-xs text-muted-foreground self-center">Manual adjustments</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Upload screenshots</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))}
            className="block w-full text-sm"
          />
          {files.length > 0 && (
            <div className="text-xs text-muted-foreground">{files.length} file(s) selected</div>
          )}
          <Button onClick={() => upload.mutate()} disabled={!files.length || upload.isPending}>
            {upload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Count with AI
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
