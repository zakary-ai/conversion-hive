import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyRecordings, syncMyCalls, type RecordingRow } from "@/lib/api/calls.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneIncoming, RefreshCw, Search, ChevronDown, ChevronUp, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/b2b/recordings")({
  component: RecordingHub,
  head: () => ({
    meta: [
      { title: "Call Recordings | Conversion Lab" },
      { name: "description", content: "Browse and replay every call recording pulled from your Quo number, searchable by lead name or phone number." },
      { property: "og:title", content: "Call Recordings | Conversion Lab" },
      { property: "og:description", content: "Browse and replay every call recording pulled from your Quo number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function fmtDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function leadLabel(r: RecordingRow): string {
  if (r.leads?.name) return r.leads.name;
  const p = r.pool;
  if (p) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (p.company) return p.company;
  }
  const inbound = (r.direction ?? "").startsWith("in");
  return (inbound ? r.from_number : r.to_number) || "Unknown number";
}

function RecordingHub() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"newest" | "longest">("newest");
  const [recordedOnly, setRecordedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["my-recordings", search, page, sort, recordedOnly],
    queryFn: () => listMyRecordings({ data: { search: search || undefined, page, pageSize, sort, recordedOnly } }),
  });

  const rows = (data?.rows ?? []) as RecordingRow[];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const applySearch = () => { setSearch(searchInput.trim()); setPage(1); };

  const refresh = async () => {
    setSyncing(true);
    try {
      const res = await syncMyCalls();
      if (!res.ok) toast.error("No Quo number is linked to your account yet — ask an admin to assign one.");
      else toast.success("Synced with Quo");
      await qc.invalidateQueries({ queryKey: ["my-recordings"] });
      await qc.invalidateQueries({ queryKey: ["my-call-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="Recording Hub" description="Every call from your Quo number — search by lead name or phone number." />
        <Button size="sm" variant="outline" onClick={refresh} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name or phone number…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
            />
          </div>
          <Button size="sm" onClick={applySearch}>Search</Button>
          {search && (
            <Button size="sm" variant="ghost" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}>Clear</Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={sort === "newest" ? "default" : "outline"} onClick={() => { setSort("newest"); setPage(1); }}>Newest</Button>
          <Button size="sm" variant={sort === "longest" ? "default" : "outline"} onClick={() => { setSort("longest"); setPage(1); }}>Longest</Button>
          <Button size="sm" variant={recordedOnly ? "default" : "outline"} onClick={() => { setRecordedOnly((v) => !v); setPage(1); }}>
            <Mic className="h-4 w-4 mr-1" /> Recorded only
          </Button>
        </div>
      </Card>

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading calls…</Card>}

      {!isLoading && rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No calls found.</Card>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const inbound = (r.direction ?? "").startsWith("in");
          const when = r.started_at ?? r.created_at;
          const open = openId === r.id;
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {inbound ? <PhoneIncoming className="h-4 w-4 text-primary" /> : <Phone className="h-4 w-4 text-muted-foreground" />}
                    <span className="truncate">{leadLabel(r)}</span>
                    {!r.recording_url && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <MicOff className="h-3 w-3 mr-1" /> No recording
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{new Date(when).toLocaleString()}</span>
                    <span>{inbound ? r.from_number : r.to_number}</span>
                    <span>{fmtDuration(r.duration_sec)}</span>
                    {r.status && <span className="capitalize">{r.status.replace(/[-_]/g, " ")}</span>}
                  </div>
                </div>
                {(r.transcript || r.summary) && (
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(open ? null : r.id)}>
                    {open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                    {open ? "Hide" : "Transcript"}
                  </Button>
                )}
              </div>

              {r.recording_url && (
                <audio
                  controls
                  preload="none"
                  src={r.recording_url}
                  className="mt-3 w-full"
                  onError={(e) => { (e.currentTarget as HTMLAudioElement).dataset.failed = "1"; }}
                />
              )}

              {open && (
                <div className="mt-3 space-y-3 text-sm">
                  {r.summary && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Summary</div>
                      <div className="whitespace-pre-wrap text-muted-foreground">{r.summary}</div>
                    </div>
                  )}
                  {r.transcript && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Transcript</div>
                      <div className="whitespace-pre-wrap text-muted-foreground max-h-72 overflow-y-auto">{r.transcript}</div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {pages} · {total} calls</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
