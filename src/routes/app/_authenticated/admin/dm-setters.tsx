import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDmSetters, listDmManagers, createDmSetter, deleteDmSetter, updateDmSetter,
  getAdminDmSetterDetail,
} from "@/lib/api/dm-setters.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Copy, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/admin/dm-setters")({
  component: AdminDmSetters,
});

function AdminDmSetters() {
  const qc = useQueryClient();
  const { data: setters = [] } = useQuery({ queryKey: ["dm-setters"], queryFn: () => listDmSetters() });
  const { data: managers = [] } = useQuery({ queryKey: ["dm-managers"], queryFn: () => listDmManagers() });
  const [openId, setOpenId] = useState<string | null>(null);

  const [form, setForm] = useState({ full_name: "", email: "", is_manager: false, manager_id: "" });
  const [createOpen, setCreateOpen] = useState(false);

  const create = useMutation({
    mutationFn: () => createDmSetter({ data: {
      full_name: form.full_name, email: form.email, is_manager: form.is_manager,
      manager_id: form.is_manager ? null : (form.manager_id || null),
    } }),
    onSuccess: (r) => {
      toast.success(`Created. Password: ${r.default_password}`);
      setCreateOpen(false);
      setForm({ full_name: "", email: "", is_manager: false, manager_id: "" });
      qc.invalidateQueries({ queryKey: ["dm-setters"] });
      qc.invalidateQueries({ queryKey: ["dm-managers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteDmSetter({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dm-setters"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dmSetters = setters.filter((s) => !s.is_manager);
  const managerRows = setters.filter((s) => s.is_manager);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">DM Setters</h1>
          <p className="text-sm text-muted-foreground">Manage DM setters and their managers.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create DM {form.is_manager ? "Manager" : "Setter"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_manager} onCheckedChange={(v) => setForm({ ...form, is_manager: v })} />
                <Label>Is a manager</Label>
              </div>
              {!form.is_manager && managers.length > 0 && (
                <div>
                  <Label>Assign to manager</Label>
                  <Select value={form.manager_id} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button disabled={!form.full_name || !form.email || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Managers</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {managerRows.map((s) => (
            <Row key={s.id} setter={s} onOpen={() => setOpenId(s.id)} onDelete={() => del.mutate(s.id)} />
          ))}
          {managerRows.length === 0 && <div className="text-sm text-muted-foreground">No managers yet.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>DM Setters</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {dmSetters.map((s) => (
            <Row key={s.id} setter={s} onOpen={() => setOpenId(s.id)} onDelete={() => del.mutate(s.id)} managers={managers} />
          ))}
          {dmSetters.length === 0 && <div className="text-sm text-muted-foreground">No DM setters yet.</div>}
        </CardContent>
      </Card>

      {openId && <DetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

type SetterRow = {
  id: string; full_name: string | null; email: string | null; apply_slug: string | null;
  is_manager: boolean; manager_id: string | null;
};

function Row({ setter, onOpen, onDelete, managers }: {
  setter: SetterRow; onOpen: () => void; onDelete: () => void;
  managers?: Array<{ id: string; full_name: string }>;
}) {
  const link = typeof window !== "undefined" ? `${window.location.origin}/apply?dm=${setter.apply_slug}` : "";
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <button onClick={onOpen} className="text-left flex-1 min-w-0">
        <div className="font-medium">{setter.full_name}</div>
        <div className="text-xs text-muted-foreground truncate">{setter.email} • /apply?dm={setter.apply_slug}</div>
      </button>
      <div className="flex items-center gap-1">
        {managers && !setter.is_manager && (
          <ManagerSelect setterId={setter.id} value={setter.manager_id ?? ""} managers={managers} />
        )}
        <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ManagerSelect({ setterId, value, managers }: { setterId: string; value: string; managers: Array<{ id: string; full_name: string }> }) {
  const qc = useQueryClient();
  const upd = useMutation({
    mutationFn: (manager_id: string | null) => updateDmSetter({ data: { id: setterId, manager_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dm-setters"] }); toast.success("Updated"); },
  });
  return (
    <Select value={value || "none"} onValueChange={(v) => upd.mutate(v === "none" ? null : v)}>
      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Manager" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No manager</SelectItem>
        {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["dm-setter-detail", id], queryFn: () => getAdminDmSetterDetail({ data: { id } }) });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{data?.setter.full_name ?? "Loading…"}</DialogTitle></DialogHeader>
        {data && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground break-all">/apply?dm={data.setter.apply_slug}</div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Stat label="Applied" value={data.stats.applied} />
              <Stat label="Booked" value={data.stats.booked} />
              <Stat label="No Show" value={data.stats.no_show} />
              <Stat label="DQ" value={data.stats.disqualified} />
              <Stat label="Not Interested" value={data.stats.not_interested} />
              <Stat label="Closes" value={data.stats.closed} />
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">Commission</CardTitle></CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">${data.stats.total_commission.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">7.5% of ${data.stats.total_revenue.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Recent DM logs</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {data.logs.map((l) => (
                    <div key={l.id} className="flex justify-between border-b border-border/60 py-1">
                      <span>{l.log_date}</span>
                      <span className="tabular-nums">{(l.ai_count ?? 0) + (l.manual_adjustment ?? 0)} / {l.target ?? 100}</span>
                    </div>
                  ))}
                  {data.logs.length === 0 && <div className="text-muted-foreground">No logs.</div>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
