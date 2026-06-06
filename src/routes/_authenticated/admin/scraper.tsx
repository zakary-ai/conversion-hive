import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getScraperSettings,
  updateScraperSettings,
  listScraperSetters,
  updateSetterScraperConfig,
  runScraperNow,
  listScraperRuns,
} from "@/lib/api/scraper.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";

const settingsOpts = queryOptions({ queryKey: ["scraper-settings"], queryFn: () => getScraperSettings() });
const settersOpts = queryOptions({ queryKey: ["scraper-setters"], queryFn: () => listScraperSetters() });
const runsOpts = queryOptions({ queryKey: ["scraper-runs"], queryFn: () => listScraperRuns() });

export const Route = createFileRoute("/_authenticated/admin/scraper")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(settingsOpts),
    context.queryClient.ensureQueryData(settersOpts),
    context.queryClient.ensureQueryData(runsOpts),
  ]),
  component: ScraperPage,
});

function ScraperPage() {
  const { data: settings } = useSuspenseQuery(settingsOpts);
  const { data: setters } = useSuspenseQuery(settersOpts);
  const { data: runs } = useSuspenseQuery(runsOpts);
  const qc = useQueryClient();

  const DEFAULT_ACTOR = "compass/google-maps-extractor";
  const DEFAULT_INPUT = {
    searchStringsArray: ["roofing contractor"],
    locationQuery: "Austin, Texas, United States",
    maxCrawledPlacesPerSearch: 200,
    language: "en",
    skipClosedPlaces: true,
  };
  const DEFAULT_FIELD_MAP = { name: "title", phone: "phoneUnformatted", email: "emails", company: "categoryName", source: "url" };

  const [enabled, setEnabled] = useState<boolean>(settings?.enabled ?? false);
  const [actorId, setActorId] = useState<string>(settings?.apify_actor_id || DEFAULT_ACTOR);
  const [batchSize, setBatchSize] = useState<number>(settings?.batch_size ?? 200);
  const [recycleDays, setRecycleDays] = useState<number>(settings?.recycle_days ?? 3);
  const [inputJson, setInputJson] = useState<string>(JSON.stringify(settings?.apify_input && Object.keys(settings.apify_input).length ? settings.apify_input : DEFAULT_INPUT, null, 2));
  const [fieldMapJson, setFieldMapJson] = useState<string>(JSON.stringify(settings?.field_map && Object.keys(settings.field_map).length ? settings.field_map : DEFAULT_FIELD_MAP, null, 2));


  const saveSettings = useMutation({
    mutationFn: async () => {
      let apify_input: Record<string, unknown> = {};
      let field_map: Record<string, string> = {};
      try { apify_input = JSON.parse(inputJson || "{}"); } catch { throw new Error("Apify input is not valid JSON"); }
      try { field_map = JSON.parse(fieldMapJson || "{}"); } catch { throw new Error("Field map is not valid JSON"); }
      await updateScraperSettings({ data: { enabled, apify_actor_id: actorId, apify_input, batch_size: batchSize, field_map, recycle_days: recycleDays } });
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["scraper-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSetter = useMutation({
    mutationFn: (v: { user_id: string; scraper_enabled?: boolean; daily_lead_quota?: number }) => updateSetterScraperConfig({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scraper-setters"] }),
  });

  const runNow = useMutation({
    mutationFn: () => runScraperNow(),
    onSuccess: (r) => {
      toast.success(`Done — recycled ${r.recycled}, fetched ${r.fetched}, inserted ${r.inserted}, distributed ${r.distributed}`);
      qc.invalidateQueries({ queryKey: ["scraper-setters"] });
      qc.invalidateQueries({ queryKey: ["scraper-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Lead scraper" description="Daily Apify-powered lead pipeline" action={
        <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
          {runNow.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
          Run now
        </Button>
      } />

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Master toggle</h3>
            <p className="text-sm text-muted-foreground">Daily cron at 8:00 AM EST runs only when this is on.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Apify actor ID</Label>
            <Input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="compass/google-maps-extractor" />
            <p className="text-xs text-muted-foreground mt-1">
              Default actor: <code>compass/google-maps-extractor</code>. Edit <code>searchStringsArray</code> and <code>locationQuery</code> below to target your market. The <code>emails</code> field is usually empty unless you enable contact enrichment in the input.
            </p>
          </div>

          <div>
            <Label>Batch size</Label>
            <Input type="number" min={1} max={1000} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value) || 200)} />
          </div>
          <div>
            <Label>Recycle "No Answer" after (days)</Label>
            <Input type="number" min={1} max={60} value={recycleDays} onChange={(e) => setRecycleDays(Number(e.target.value) || 3)} />
          </div>
        </div>

        <div>
          <Label>Apify input JSON</Label>
          <Textarea rows={6} value={inputJson} onChange={(e) => setInputJson(e.target.value)} className="font-mono text-xs" />
        </div>

        <div>
          <Label>Field mapping (Apify field → lead field)</Label>
          <Textarea rows={4} value={fieldMapJson} onChange={(e) => setFieldMapJson(e.target.value)} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground mt-1">Keys are lead columns (name, phone, email, company, source). Values are the Apify dataset field name.</p>
        </div>

        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save settings</Button>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Setters</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-2">Name</th><th className="text-left p-2">New now</th><th className="text-left p-2">Daily quota</th><th className="text-left p-2">Enabled</th></tr>
            </thead>
            <tbody>
              {setters.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No setters yet.</td></tr>}
              {setters.map((s) => (
                <tr key={s.user_id} className="border-t border-border">
                  <td className="p-2">{s.full_name || s.email || s.user_id.slice(0, 8)}</td>
                  <td className="p-2">{s.current_new}</td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      defaultValue={s.daily_lead_quota}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== s.daily_lead_quota) updateSetter.mutate({ user_id: s.user_id, daily_lead_quota: v });
                      }}
                      className="w-24"
                    />
                  </td>
                  <td className="p-2">
                    <Switch
                      checked={s.scraper_enabled}
                      onCheckedChange={(v) => updateSetter.mutate({ user_id: s.user_id, scraper_enabled: v })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Recent runs</h3>
        <div className="space-y-2">
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {runs.map((r) => (
            <div key={r.id} className="text-xs border border-border rounded p-2">
              <div className="flex justify-between">
                <span>{new Date(r.ran_at).toLocaleString()}</span>
                <span className="font-mono">{r.status}</span>
              </div>
              <div className="text-muted-foreground">Leads added: {r.leads_added}</div>
              {r.details ? <pre className="mt-1 overflow-x-auto bg-muted/40 p-2 rounded">{JSON.stringify(r.details, null, 2)}</pre> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
