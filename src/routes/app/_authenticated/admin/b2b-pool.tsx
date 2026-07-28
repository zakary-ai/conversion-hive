import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { adminListPool, adminBulkImportPool, listAllCallbacksAdmin, adminGetPoolLead, listPoolFacets } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { B2bLeadDetailDialog } from "@/components/b2b-lead-detail-dialog";
import { parseCsv } from "@/lib/csv";
import { Upload, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";

const PAGE = 50;
type StatusFilter = "all" | "unclaimed" | "claimed" | "burned" | "booked";
const opts = (offset: number, status: StatusFilter, search: string) =>
  queryOptions({
    queryKey: ["admin-pool", offset, status, search],
    queryFn: () => adminListPool({ data: { limit: PAGE, offset, status, search: search || undefined } }),
  });

const cbOpts = queryOptions({
  queryKey: ["admin-all-callbacks"],
  queryFn: () => listAllCallbacksAdmin(),
});

export const Route = createFileRoute("/app/_authenticated/admin/b2b-pool")({
  head: () => ({ meta: [{ title: "B2B Lead Pool (Admin)" }, { name: "description", content: "Manage the shared B2B lead pool." }] }),
  component: AdminPoolPage,
});

function AdminPoolPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data } = useSuspenseQuery(opts(offset, status, search));
  const detail = useQuery({
    queryKey: ["admin-pool-lead", selectedId],
    queryFn: () => adminGetPoolLead({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="B2B Lead Pool" description={`${total} leads · shared across all setters`} />
        <CsvImportButton />
      </div>

      <Tabs defaultValue="pool">
        <TabsList>
          <TabsTrigger value="pool">Pool</TabsTrigger>
          <TabsTrigger value="callbacks">Callbacks</TabsTrigger>
        </TabsList>

        <TabsContent value="pool" className="space-y-4">
          <Card className="p-3">
            <form
              className="flex gap-2 flex-wrap"
              onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(inputVal); }}
            >
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search…" value={inputVal} onChange={(e) => setInputVal(e.target.value)} className="pl-9" />
              </div>
              <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setOffset(0); }}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="unclaimed">Unclaimed</SelectItem>
                  <SelectItem value="claimed">Claimed</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="burned">Burned</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" variant="outline">Search</Button>
            </form>
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3">Name</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Claimed by</th>
                  <th className="p-3">Imported</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="p-3">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td className="p-3">{r.company || "—"}</td>
                    <td className="p-3">{r.email || "—"}</td>
                    <td className="p-3">{r.phone || "—"}</td>
                    <td className="p-3"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="p-3">{(r as any).setter_name || (r.claimed_by ? "—" : "")}</td>
                    <td className="p-3">{r.imported_at ? new Date(r.imported_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No leads yet. Import a CSV to get started.</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Page {page} of {pages}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="callbacks" className="space-y-4">
          <CallbacksTable />
        </TabsContent>
      </Tabs>

      <B2bLeadDetailDialog
        lead={detail.data?.lead ?? null}
        onClose={() => setSelectedId(null)}
        showActions={false}
        extraHeader={detail.data?.setter && (
          <div className="text-xs text-muted-foreground mt-1">
            Claimed by {detail.data.setter.full_name || detail.data.setter.email}
          </div>
        )}
      />
    </div>
  );
}

function CallbacksTable() {
  const { data, isLoading } = useQuery(cbOpts);
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const rows = data ?? [];
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-3">When</th>
            <th className="p-3">Lead</th>
            <th className="p-3">Setter</th>
            <th className="p-3">Status</th>
            <th className="p-3">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lead: any = (r as any).lead;
            const name = lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.company || "—" : "—";
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{new Date(r.scheduled_at).toLocaleString()}</td>
                <td className="p-3">{name}</td>
                <td className="p-3">{(r as any).setter_name || "—"}</td>
                <td className="p-3"><Badge variant="outline">{r.status}</Badge></td>
                <td className="p-3 text-muted-foreground">{r.note || "—"}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No callbacks scheduled.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}


type FieldKey =
  | "segment" | "lead_type" | "first_name" | "last_name" | "name"
  | "title" | "company" | "website" | "email" | "email_status"
  | "phone" | "linkedin_url" | "city" | "state" | "industry"
  | "company_size" | "notes";

const FIELDS: { key: FieldKey; label: string; hint?: string; match: (k: string) => boolean }[] = [
  { key: "first_name", label: "First name", match: (k) => ["first_name","first","firstname"].includes(k) || k.includes("first") },
  { key: "last_name", label: "Last name", match: (k) => ["last_name","last","lastname"].includes(k) || k.includes("last") },
  { key: "name", label: "Full name", hint: "Used only if first/last are empty", match: (k) => ["name","full_name","contact"].includes(k) },
  { key: "company", label: "Company", match: (k) => k.includes("company") || k.includes("business") || k.includes("organization") },
  { key: "title", label: "Title", match: (k) => k.includes("title") || k.includes("position") },
  { key: "email", label: "Email", match: (k) => k === "email" || k.includes("email_address") || k.includes("e-mail") },
  { key: "email_status", label: "Email status", match: (k) => k.includes("email_status") || k.includes("email status") },
  { key: "phone", label: "Phone", match: (k) => k.includes("phone") || k.includes("mobile") || k.includes("cell") || k.includes("telephone") },
  { key: "website", label: "Website", match: (k) => k.includes("website") || k.includes("url") && !k.includes("linkedin") || k.includes("domain") || k === "site" },
  { key: "linkedin_url", label: "LinkedIn URL", match: (k) => k.includes("linkedin") },
  { key: "segment", label: "Segment", match: (k) => k.includes("segment") },
  { key: "lead_type", label: "Lead type", match: (k) => k.includes("lead_type") || k === "type" },
  { key: "industry", label: "Industry", match: (k) => k.includes("industry") },
  { key: "company_size", label: "Company size", match: (k) => k.includes("company_size") || k.includes("employees") || k === "size" },
  { key: "city", label: "City", match: (k) => k === "city" },
  { key: "state", label: "State", match: (k) => k === "state" || k.includes("region") || k.includes("province") },
  { key: "notes", label: "Notes", match: (k) => k.includes("note") || k.includes("comment") },
];

type Mapping = Partial<Record<FieldKey, string>>;

function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const m: Mapping = {};
  for (const f of FIELDS) {
    const h = headers.find((k) => !used.has(k) && f.match(k));
    if (h) { m[f.key] = h; used.add(h); }
  }
  return m;
}

function CsvImportButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, string> | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [segmentOverride, setSegmentOverride] = useState<string>("");
  const [segmentCustom, setSegmentCustom] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const facets = useQuery({
    queryKey: ["b2b-pool-facets"],
    queryFn: () => listPoolFacets(),
    enabled: !!files,
  });

  const openFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const arr = Array.from(fileList);
    try {
      const text = await arr[0].text();
      const rows = parseCsv(text);
      if (!rows.length) { toast.error(`${arr[0].name}: empty`); return; }
      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setSample(rows[0]);
      setPreviewRows(rows);
      setMapping(autoMap(hdrs));
      setFiles(arr);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const close = () => { setFiles(null); setHeaders([]); setSample(null); setMapping({}); setPreviewRows([]); setSegmentOverride(""); setSegmentCustom(""); };

  const effectiveSegment = (): string | null => {
    if (segmentOverride === "__custom") return segmentCustom.trim() || null;
    if (segmentOverride && segmentOverride !== "__none") return segmentOverride;
    return null;
  };

  const runImport = async () => {
    if (!files) return;
    setBusy(true);
    let totalInserted = 0, totalDupes = 0, totalRows = 0;
    const failures: string[] = [];
    const buildMapped = (rows: Record<string, string>[]) => rows.map((r) => {
      const get = (k?: string) => (k ? r[k] || null : null);
      let fn = get(mapping.first_name);
      let ln = get(mapping.last_name);
      if (!fn && !ln && mapping.name && r[mapping.name]) {
        const parts = r[mapping.name].trim().split(/\s+/);
        fn = parts[0] || null;
        ln = parts.slice(1).join(" ") || null;
      }
      return {
        segment: effectiveSegment() ?? get(mapping.segment),
        lead_type: get(mapping.lead_type),
        first_name: fn,
        last_name: ln,
        title: get(mapping.title),
        company: get(mapping.company),
        website: get(mapping.website),
        email: get(mapping.email),
        email_status: get(mapping.email_status),
        phone: get(mapping.phone),
        linkedin_url: get(mapping.linkedin_url),
        city: get(mapping.city),
        state: get(mapping.state),
        industry: get(mapping.industry),
        company_size: get(mapping.company_size),
        notes: get(mapping.notes),
        source: "csv-import",
      };
    }).filter((r) => r.first_name || r.last_name || r.email || r.phone || r.company);

    try {
      // First file: reuse already-parsed previewRows
      const firstMapped = buildMapped(previewRows);
      totalRows += firstMapped.length;
      for (let i = 0; i < firstMapped.length; i += 500) {
        const res = await adminBulkImportPool({ data: { rows: firstMapped.slice(i, i + 500) } });
        totalInserted += res.inserted; totalDupes += res.duplicates;
      }
      for (const file of files.slice(1)) {
        try {
          const text = await file.text();
          const rows = parseCsv(text);
          const mapped = buildMapped(rows);
          totalRows += mapped.length;
          for (let i = 0; i < mapped.length; i += 500) {
            const res = await adminBulkImportPool({ data: { rows: mapped.slice(i, i + 500) } });
            totalInserted += res.inserted; totalDupes += res.duplicates;
          }
        } catch (e) {
          failures.push(`${file.name}: ${(e as Error).message}`);
        }
      }
      toast.success(`Imported ${totalInserted} of ${totalRows} · ${totalDupes} duplicate${totalDupes === 1 ? "" : "s"} skipped`);
      failures.forEach((f) => toast.error(f));
      qc.invalidateQueries({ queryKey: ["admin-pool"] });
      close();
    } finally {
      setBusy(false);
    }
  };

  const NONE = "__none";
  const setField = (key: FieldKey, val: string) => {
    setMapping((m) => ({ ...m, [key]: val === NONE ? undefined : val }));
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => openFiles(e.target.files)} />
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
        Import CSV
      </Button>

      <Dialog open={!!files} onOpenChange={(o) => !o && !busy && close()}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match CSV columns</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground">
            {files?.length ?? 0} file{(files?.length ?? 0) === 1 ? "" : "s"} · {previewRows.length} rows in first file.
            Mapping applies to all selected files.
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium">Segment for all rows</div>
            <div className="text-[11px] text-muted-foreground">
              Optionally set one segment applied to every imported row (overrides the mapped Segment column).
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={segmentOverride || "__none"} onValueChange={(v) => setSegmentOverride(v === "__none" ? "" : v)}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Use CSV column" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Use CSV column</SelectItem>
                  {(facets.data?.segments ?? []).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                  <SelectItem value="__custom">+ New segment…</SelectItem>
                </SelectContent>
              </Select>
              {segmentOverride === "__custom" && (
                <Input
                  placeholder="New segment name"
                  value={segmentCustom}
                  onChange={(e) => setSegmentCustom(e.target.value)}
                  className="w-[240px]"
                />
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <div className="text-xs font-medium">
                  {f.label}
                  {f.hint && <span className="ml-1 text-muted-foreground font-normal">({f.hint})</span>}
                </div>
                <Select value={mapping[f.key] ?? NONE} onValueChange={(v) => setField(f.key, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— none —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mapping[f.key] && sample && (
                  <div className="text-[10px] text-muted-foreground truncate">
                    e.g. {sample[mapping[f.key]!] || <em>empty</em>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
            <Button onClick={runImport} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
