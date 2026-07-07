import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Copy, Trash2, Plus, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/_authenticated/admin/dm-setters")({
  component: AdminDmSetters,
});

function AdminDmSetters() {
  const qc = useQueryClient();
  const { data: setters = [] } = useQuery({ queryKey: ["dm-setters"], queryFn: () => listDmSetters() });
  const { data: managers = [] } = useQuery({ queryKey: ["dm-managers"], queryFn: () => listDmManagers() });
  const [openId, setOpenId] = useState<string | null>(null);

  const [form, setForm] = useState({ full_name: "", email: "", is_manager: false, manager_id: "", commission_rate: 0.075 });
  const [createOpen, setCreateOpen] = useState(false);

  const create = useMutation({
    mutationFn: () => createDmSetter({ data: {
      full_name: form.full_name, email: form.email, is_manager: form.is_manager,
      manager_id: form.is_manager ? null : (form.manager_id || null),
      commission_rate: form.is_manager ? undefined : form.commission_rate,
    } }),
    onSuccess: (r) => {
      toast.success(`Created. Password: ${r.default_password}`);
      setCreateOpen(false);
      setForm({ full_name: "", email: "", is_manager: false, manager_id: "", commission_rate: 0.075 });
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
              {!form.is_manager && (
                <div>
                  <Label>Commission tier</Label>
                  <Select
                    value={String(form.commission_rate)}
                    onValueChange={(v) => setForm({ ...form, commission_rate: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.075">Standard — 7.5% per closed deal</SelectItem>
                      <SelectItem value="0.1">Premium — 10% per closed deal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
  managers?: Array<{ id: string; full_name: string | null }>;
}) {
  const link = setter.apply_slug ? `https://conversionlab.space/apply?dm=${setter.apply_slug}` : "";
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

function ManagerSelect({ setterId, value, managers }: { setterId: string; value: string; managers: Array<{ id: string; full_name: string | null }> }) {
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

type RangeMode = "today" | "all" | "custom";
type Section = "applied" | "booked" | "no_show" | "disqualified" | "not_interested" | "closed";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [mode, setMode] = useState<RangeMode>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [section, setSection] = useState<Section>("applied");

  const range = useMemo(() => {
    if (mode === "all") return { from: null, to: null };
    if (mode === "today") {
      const now = new Date();
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    }
    return {
      from: customFrom ? startOfDay(customFrom).toISOString() : null,
      to: customTo ? endOfDay(customTo).toISOString() : null,
    };
  }, [mode, customFrom, customTo]);

  const { data } = useQuery({
    queryKey: ["dm-setter-detail", id, range.from, range.to],
    queryFn: () => getAdminDmSetterDetail({ data: { id, from: range.from, to: range.to } }),
  });

  const leads = useMemo(() => {
    type Lead = { id: string; name: string; email: string; when: string; extra?: string };
    if (!data) return [] as Lead[];
    if (section === "applied") {
      return data.applications
        .map<Lead>((a) => ({ id: a.id, name: a.full_name ?? "—", email: a.email ?? "—", when: a.created_at }))
        .sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""));
    }
    const filter = (o: string | null) => section === "booked" ? true : o === section;
    return data.bookings
      .filter((b) => filter(b.outcome))
      .map((b) => ({
        id: b.id,
        name: b.applicant_name ?? "—",
        email: b.applicant_email ?? "—",
        when: b.slot_start,
        extra: b.outcome
          ? (b.outcome === "closed" && b.deal_amount ? `closed · $${Number(b.deal_amount).toLocaleString()}` : b.outcome.replace("_", " "))
          : (b.status ?? ""),
      }))
      .sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""));
  }, [data, section]);

  const sections: Array<{ key: Section; label: string; value: number }> = data ? [
    { key: "applied", label: "Applied", value: data.stats.applied },
    { key: "booked", label: "Booked", value: data.stats.booked },
    { key: "no_show", label: "No Show", value: data.stats.no_show },
    { key: "disqualified", label: "DQ", value: data.stats.disqualified },
    { key: "not_interested", label: "Not Interested", value: data.stats.not_interested },
    { key: "closed", label: "Closes", value: data.stats.closed },
  ] : [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{data?.setter.full_name ?? "Loading…"}</DialogTitle></DialogHeader>
        {data && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground break-all">/apply?dm={data.setter.apply_slug}</div>

            {/* Date range controls */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={mode === "today" ? "default" : "outline"} onClick={() => setMode("today")}>Today</Button>
              <Button size="sm" variant={mode === "all" ? "default" : "outline"} onClick={() => setMode("all")}>All time</Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant={mode === "custom" ? "default" : "outline"}
                    className={cn("gap-2", !customFrom && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {mode === "custom" && customFrom
                      ? `${format(customFrom, "MMM d")}${customTo ? ` – ${format(customTo, "MMM d")}` : ""}`
                      : "Custom range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={(r) => {
                      setCustomFrom(r?.from);
                      setCustomTo(r?.to);
                      if (r?.from) setMode("custom");
                    }}
                    numberOfMonths={2}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Clickable stat buttons */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {sections.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    section === s.key ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                  )}
                >
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-lg font-semibold tabular-nums">{s.value}</div>
                </button>
              ))}
            </div>

            {/* Leads table for selected section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base capitalize">
                  {sections.find((s) => s.key === section)?.label} ({leads.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leads.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No leads in this range.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Date</TableHead>
                        {section !== "applied" && <TableHead>Status</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.name}</TableCell>
                          <TableCell className="text-muted-foreground">{l.email}</TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {l.when ? format(new Date(l.when), "MMM d, yyyy h:mm a") : "—"}
                          </TableCell>
                          {section !== "applied" && <TableCell className="text-xs capitalize">{l.extra}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Commission (in range)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">${data.stats.total_commission.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">7.5% of ${data.stats.total_revenue.toFixed(2)}</div>
              </CardContent>
            </Card>

            {data.setter.is_manager && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Setters under management ({data.team.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.team.length === 0 && (
                    <div className="text-sm text-muted-foreground">No setters assigned to this manager.</div>
                  )}
                  {data.team.map((t) => {
                    const pct = Math.min(100, t.kpi_percent);
                    const color = t.kpi_percent >= 100 ? "text-emerald-600" : t.kpi_percent >= 60 ? "text-amber-600" : "text-red-600";
                    return (
                      <div key={t.setter.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{t.setter.full_name}</div>
                            <div className="text-xs text-muted-foreground truncate">{t.setter.email}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn("text-sm font-semibold tabular-nums", color)}>{t.kpi_percent}%</div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              {t.dms.toLocaleString()} / {t.target_total.toLocaleString()} DMs
                            </div>
                          </div>
                        </div>
                        <Progress value={pct} className="mt-2 h-2" />
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Target {t.target}/day{data.rangeDays ? ` · ${data.rangeDays} day${data.rangeDays > 1 ? "s" : ""}` : ` · ${t.days_logged} logged day${t.days_logged === 1 ? "" : "s"}`}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
