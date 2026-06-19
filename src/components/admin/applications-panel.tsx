import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listApplications, updateApplication, deleteApplication } from "@/lib/api/applications.functions";
import { StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["New", "No Answer", "Follow Up", "Booked", "Not Interested"] as const;
type Status = typeof STATUSES[number];
type Application = Awaited<ReturnType<typeof listApplications>>[number];

export const appsOpts = queryOptions({ queryKey: ["applications"], queryFn: () => listApplications() });

export function ApplicationsPanel() {
  const { data: apps } = useSuspenseQuery(appsOpts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name" | "status">("newest");
  const [selected, setSelected] = useState<Application | null>(null);

  const filtered = useMemo(() => {
    let list = apps.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return a.full_name.toLowerCase().includes(s) || a.phone.toLowerCase().includes(s);
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "newest") return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
      if (sort === "name") return a.full_name.localeCompare(b.full_name);
      return a.status.localeCompare(b.status);
    });
    return list;
  }, [apps, search, statusFilter, sort]);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3 hidden md:table-cell">Phone</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3 hidden lg:table-cell">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No applications.</td></tr>
              )}
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelected(a)}
                >
                  <td className="p-3 font-medium">{a.full_name}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{a.phone}</td>
                  <td className="p-3"><StatusPill status={a.status} /></td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ApplicationDialog app={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ApplicationDialog({ app, onClose }: { app: Application | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("New");
  const [notes, setNotes] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);

  if (app && app.id !== lastId) {
    setLastId(app.id);
    setStatus(app.status as Status);
    setNotes(app.admin_notes ?? "");
  }

  const save = useMutation({
    mutationFn: () => updateApplication({ data: { id: app!.id, status, admin_notes: notes || null } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["applications"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteApplication({ data: { id: app!.id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["applications"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!app} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{app?.full_name}</DialogTitle>
        </DialogHeader>
        {app && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Phone" value={app.phone} />
              <Field label="Submitted" value={new Date(app.created_at).toLocaleString()} />
              <Field label="Current monthly income" value={app.current_monthly_income} />
              <Field label="Desired monthly income" value={app.desired_monthly_income} />
              <Field label="Open to invest" value={app.open_to_invest ?? "—"} />
              <Field label="Credit score range" value={app.credit_score_range} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Why remote sales</Label>
              <div className="mt-1 p-3 rounded-md bg-muted/30 border border-border text-sm whitespace-pre-wrap">{app.why_remote_sales ?? "—"}</div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Internal notes</Label>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes only visible to admins" />
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => confirm("Delete this application?") && del.mutate()}
                disabled={del.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
