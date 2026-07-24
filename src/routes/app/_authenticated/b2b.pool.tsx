import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listUnclaimedPool, listPoolFacets, claimPoolLead } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, ExternalLink, Phone, Mail, Building2, Linkedin, MapPin } from "lucide-react";
import { toast } from "sonner";

const PAGE = 25;
const opts = (offset: number, search: string, segment: string, industry: string) => queryOptions({
  queryKey: ["pool-unclaimed", offset, search, segment, industry],
  queryFn: () => listUnclaimedPool({ data: {
    limit: PAGE, offset,
    search: search || undefined,
    segment: segment || undefined,
    industry: industry || undefined,
  } }),
});
const facetOpts = queryOptions({ queryKey: ["pool-facets"], queryFn: () => listPoolFacets() });

export const Route = createFileRoute("/app/_authenticated/b2b/pool")({
  head: () => ({ meta: [{ title: "Lead Pool" }, { name: "description", content: "Claim a lead from the shared pool." }] }),
  component: PoolPage,
});

function PoolPage() {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [segment, setSegment] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [preview, setPreview] = useState<any | null>(null);

  const { data } = useSuspenseQuery(opts(offset, search, segment, industry));
  const { data: facets } = useQuery(facetOpts);

  const claim = useMutation({
    mutationFn: (id: string) => claimPoolLead({ data: { id } }),
    onSuccess: () => {
      toast.success("Lead claimed");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["pool-unclaimed"] });
      qc.invalidateQueries({ queryKey: ["pool-facets"] });
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Lead Pool" description={`${total} unclaimed leads available`} />

      <Card className="p-3 space-y-2">
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(inputVal); }}
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, company, email…" value={inputVal} onChange={(e) => setInputVal(e.target.value)} className="pl-9" />
          </div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <div className="flex gap-2 flex-wrap">
          <Select value={segment || "__all"} onValueChange={(v) => { setSegment(v === "__all" ? "" : v); setOffset(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All segments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All segments</SelectItem>
              {(facets?.segments ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={industry || "__all"} onValueChange={(v) => { setIndustry(v === "__all" ? "" : v); setOffset(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All industries" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All industries</SelectItem>
              {(facets?.industries ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {(segment || industry) && (
            <Button variant="ghost" size="sm" onClick={() => { setSegment(""); setIndustry(""); setOffset(0); }}>Clear</Button>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Title</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Segment</th>
              <th className="p-3">Industry</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setPreview(r)}>
                <td className="p-3">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="p-3">{r.company || "—"}</td>
                <td className="p-3">{r.title || "—"}</td>
                <td className="p-3">{r.phone || "—"}</td>
                <td className="p-3">{(r as any).segment || "—"}</td>
                <td className="p-3">{(r as any).industry || "—"}</td>
                <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" disabled={claim.isPending} onClick={() => claim.mutate(r.id)}>Claim</Button>
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No unclaimed leads.</td></tr>
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
          <Link to="/app/b2b/leads" className="inline-flex items-center rounded-md border px-3 py-1 text-sm">My leads</Link>
        </div>
      </div>

      <LeadPreviewDialog
        lead={preview}
        onClose={() => setPreview(null)}
        onClaim={(id) => claim.mutate(id)}
        claiming={claim.isPending}
      />
    </div>
  );
}

function LeadPreviewDialog({ lead, onClose, onClaim, claiming }: {
  lead: any | null; onClose: () => void; onClaim: (id: string) => void; claiming: boolean;
}) {
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle>{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <Field icon={<Building2 className="h-4 w-4" />} label="Company" value={lead.company} />
              <Field label="Title" value={lead.title} />
              <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={lead.phone} />
              <Field icon={<Mail className="h-4 w-4" />} label="Email" value={lead.email} />
              <Field
                label="Website"
                value={lead.website}
                render={(v) => <a onClick={(e) => e.stopPropagation()} href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{v} <ExternalLink className="h-3 w-3" /></a>}
              />
              <Field
                icon={<Linkedin className="h-4 w-4" />}
                label="LinkedIn"
                value={lead.linkedin_url}
                render={(v) => <a onClick={(e) => e.stopPropagation()} href={/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open profile <ExternalLink className="h-3 w-3" /></a>}
              />
              <Field icon={<MapPin className="h-4 w-4" />} label="Location" value={[lead.city, lead.state].filter(Boolean).join(", ") || null} />
              <Field label="Industry" value={lead.industry} />
              <Field label="Segment" value={lead.segment} />
              <Field label="Lead type" value={lead.lead_type} />
              <Field label="Company size" value={lead.company_size} />
              <Field label="Email status" value={lead.email_status} />
              {lead.notes && <div className="sm:col-span-2"><Field label="Notes" value={lead.notes} /></div>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button disabled={claiming} onClick={() => onClaim(lead.id)}>Claim lead</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, icon, render }: {
  label: string; value: string | null | undefined; icon?: React.ReactNode; render?: (v: string) => React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 text-sm break-words">{value ? (render ? render(value) : value) : <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
