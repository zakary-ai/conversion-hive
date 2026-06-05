import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listMyLeads, updateLead } from "@/lib/api/cl.functions";
import { PageHeader, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

const opts = queryOptions({ queryKey: ["my-leads"], queryFn: () => listMyLeads() });
const STATUSES = ["New","Contacted","No Answer","Interested","Booked","Not Interested","Follow Up"] as const;
type Status = typeof STATUSES[number];
type Lead = Awaited<ReturnType<typeof listMyLeads>>[number];

export const Route = createFileRoute("/_authenticated/leads")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: LeadsPage,
});

function LeadsPage() {
  const { data: leads } = useSuspenseQuery(opts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState<Lead | null>(null);

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (l.name?.toLowerCase().includes(s) || l.company?.toLowerCase().includes(s));
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="My leads" description={`${leads.length} assigned · up to 75 active per day`} />

      <Card className="p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or company…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3 hidden md:table-cell">Company</th>
                <th className="text-left p-3 hidden lg:table-cell">Contact</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3 hidden sm:table-cell">Contacted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No leads match.</td></tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setOpen(l)}>
                  <td className="p-3 font-medium">{l.name}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{l.company}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">{l.phone || l.email}</td>
                  <td className="p-3"><StatusPill status={l.status} /></td>
                  <td className="p-3 hidden sm:table-cell text-muted-foreground">{l.contacted_at ? new Date(l.contacted_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <LeadDrawer lead={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (vars: { id: string; status?: Status; notes?: string; contacted?: boolean }) => updateLead({ data: vars }),
    onSuccess: () => {
      toast.success("Lead updated");
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["client-dashboard"] });
    },
  });
  const [notes, setNotes] = useState(lead?.notes ?? "");
  // Reset notes when lead changes
  if (lead && notes !== (lead.notes ?? "") && mut.variables?.id !== lead.id) {
    setNotes(lead.notes ?? "");
  }

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle>{lead.name}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div className="space-y-2 text-sm">
                {lead.company && <div className="text-muted-foreground">{lead.company}</div>}
                {lead.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{lead.phone}</div>}
                {lead.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{lead.email}</div>}
                {lead.source && <div className="text-xs text-muted-foreground">Source: {lead.source}</div>}
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Status</label>
                <Select value={lead.status} onValueChange={(v) => mut.mutate({ id: lead.id, status: v as Status })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="mt-1" />
                <Button size="sm" variant="outline" className="mt-2" onClick={() => mut.mutate({ id: lead.id, notes })}>
                  Save notes
                </Button>
              </div>

              <Button
                variant={lead.contacted_at ? "outline" : "default"}
                className="w-full"
                onClick={() => mut.mutate({ id: lead.id, contacted: !lead.contacted_at })}
              >
                {lead.contacted_at ? "Mark as not contacted" : "Mark as contacted"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
