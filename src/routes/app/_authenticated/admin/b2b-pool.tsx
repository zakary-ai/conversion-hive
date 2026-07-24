import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { adminListPool, adminBulkImportPool, listAllCallbacksAdmin, adminGetPoolLead } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const KEY = (arr: string[]) => (k: string) => arr.includes(k);

function CsvImportButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let totalInserted = 0, totalDupes = 0, totalRows = 0;
    const failures: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const text = await file.text();
          const rows = parseCsv(text);
          if (!rows.length) { failures.push(`${file.name}: empty`); continue; }
          const keys = Object.keys(rows[0]);
          const pick = (preds: ((k: string) => boolean)[]) => {
            for (const p of preds) { const k = keys.find(p); if (k) return k; }
            return null;
          };
          const firstK = pick([KEY(["first_name", "first name", "firstname", "first"]), (k) => k.includes("first")]);
          const lastK = pick([KEY(["last_name", "last name", "lastname", "last"]), (k) => k.includes("last")]);
          const nameK = pick([KEY(["name", "full_name", "full name", "contact"]), (k) => k === "name" || k === "full_name" || k === "contact"]);
          const segmentK = pick([KEY(["segment"]), (k) => k.includes("segment")]);
          const leadTypeK = pick([KEY(["lead_type", "lead type", "leadtype", "type"]), (k) => k.includes("lead_type") || k === "type"]);
          const titleK = pick([KEY(["title", "job_title", "job title", "position"]), (k) => k.includes("title") || k.includes("position")]);
          const companyK = pick([KEY(["company_name", "company name", "company", "business", "organization", "org"]), (k) => k.includes("company") || k.includes("business")]);
          const websiteK = pick([KEY(["company_website", "company website", "website", "url", "site", "domain"]), (k) => k.includes("website") || k.includes("url") || k.includes("domain")]);
          const emailK = pick([KEY(["email", "email_address", "e-mail"]), (k) => k === "email" || k.includes("email_address")]);
          const emailStatusK = pick([KEY(["email_status", "email status"]), (k) => k.includes("email_status") || k.includes("email status")]);
          const phoneK = pick([KEY(["phone", "phone_number", "mobile", "cell", "telephone"]), (k) => k.includes("phone") || k.includes("mobile") || k.includes("cell")]);
          const liK = pick([KEY(["linkedin", "linkedin_url", "linkedin url"]), (k) => k.includes("linkedin")]);
          const cityK = pick([KEY(["city"]), (k) => k === "city"]);
          const stateK = pick([KEY(["state", "region", "province"]), (k) => k === "state" || k.includes("region") || k.includes("province")]);
          const industryK = pick([KEY(["industry"]), (k) => k.includes("industry")]);
          const sizeK = pick([KEY(["company_size", "company size", "employees", "employee_count", "size"]), (k) => k.includes("company_size") || k.includes("employees") || k === "size"]);
          const notesK = pick([KEY(["notes", "note", "comments"]), (k) => k.includes("note") || k.includes("comment")]);

          const mapped = rows.map((r) => {
            let fn = firstK ? r[firstK] : "";
            let ln = lastK ? r[lastK] : "";
            if (!fn && !ln && nameK && r[nameK]) {
              const parts = r[nameK].split(/\s+/);
              fn = parts[0] || "";
              ln = parts.slice(1).join(" ") || "";
            }
            return {
              segment: segmentK ? r[segmentK] || null : null,
              lead_type: leadTypeK ? r[leadTypeK] || null : null,
              first_name: fn || null,
              last_name: ln || null,
              title: titleK ? r[titleK] || null : null,
              company: companyK ? r[companyK] || null : null,
              website: websiteK ? r[websiteK] || null : null,
              email: emailK ? r[emailK] || null : null,
              email_status: emailStatusK ? r[emailStatusK] || null : null,
              phone: phoneK ? r[phoneK] || null : null,
              linkedin_url: liK ? r[liK] || null : null,
              city: cityK ? r[cityK] || null : null,
              state: stateK ? r[stateK] || null : null,
              industry: industryK ? r[industryK] || null : null,
              company_size: sizeK ? r[sizeK] || null : null,
              notes: notesK ? r[notesK] || null : null,
              source: "csv-import",
            };
          }).filter((r) => r.first_name || r.last_name || r.email || r.phone || r.company);


          totalRows += mapped.length;
          for (let i = 0; i < mapped.length; i += 500) {
            const chunk = mapped.slice(i, i + 500);
            const res = await adminBulkImportPool({ data: { rows: chunk } });
            totalInserted += res.inserted;
            totalDupes += res.duplicates;
          }
        } catch (e) {
          failures.push(`${file.name}: ${(e as Error).message}`);
        }
      }
      toast.success(`Imported ${totalInserted} of ${totalRows} · ${totalDupes} duplicate${totalDupes === 1 ? "" : "s"} skipped`);
      failures.forEach((f) => toast.error(f));
      qc.invalidateQueries({ queryKey: ["admin-pool"] });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
        Import CSV
      </Button>
    </>
  );
}
