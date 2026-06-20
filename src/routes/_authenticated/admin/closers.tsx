import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listClosers, createCloser, updateCloser, deleteCloser, listCloserAvailability, replaceCloserAvailability } from "@/lib/api/b2c.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Save, UserPlus, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/closers")({
  component: ClosersPage,
});

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
type Rule = { day_of_week: number; start_minute: number; end_minute: number };
const toTime = (m: number) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const fromTime = (s: string) => { const [h,m] = s.split(":").map(Number); return (h||0)*60+(m||0); };

function ClosersPage() {
  const qc = useQueryClient();
  const { data: closers = [] } = useQuery({ queryKey: ["closers"], queryFn: () => listClosers() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", zoom_user_email: "" });

  const create = useMutation({
    mutationFn: () => createCloser({ data: form }),
    onSuccess: (res) => {
      toast.success(`Closer created. Temp password: ${res.default_password}`, { duration: 15000 });
      qc.invalidateQueries({ queryKey: ["closers"] });
      setOpen(false);
      setForm({ full_name: "", email: "", zoom_user_email: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Closers</h1>
          <p className="text-sm text-muted-foreground">Manage the closers who take B2C interview calls.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Invite closer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a closer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Login email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Zoom email (optional — defaults to login email)</Label><Input type="email" value={form.zoom_user_email} onChange={(e) => setForm({ ...form, zoom_user_email: e.target.value })} /></div>
              <Button className="w-full" disabled={!form.full_name || !form.email || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Inviting…" : "Send invite"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {closers.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No closers yet. Invite one to get started.</Card>
        )}
        {closers.map((c) => <CloserRow key={c.id} closer={c} />)}
      </div>
    </div>
  );
}

type CloserRow = {
  id: string;
  full_name: string;
  email: string;
  zoom_user_email: string | null;
  active: boolean;
};

function CloserRow({ closer }: { closer: CloserRow }) {
  const qc = useQueryClient();
  const [editAvail, setEditAvail] = useState(false);
  const toggle = useMutation({
    mutationFn: (active: boolean) => updateCloser({ data: { id: closer.id, active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closers"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => deleteCloser({ data: { id: closer.id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["closers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="font-medium">{closer.full_name}</div>
        <div className="text-xs text-muted-foreground truncate">{closer.email}</div>
        {closer.zoom_user_email && closer.zoom_user_email !== closer.email && (
          <div className="text-xs text-muted-foreground truncate">Zoom: {closer.zoom_user_email}</div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Active</span>
          <Switch checked={closer.active} onCheckedChange={(v) => toggle.mutate(v)} />
        </div>
        <Dialog open={editAvail} onOpenChange={setEditAvail}>
          <DialogTrigger asChild><Button size="sm" variant="outline">Availability</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{closer.full_name}'s availability</DialogTitle></DialogHeader>
            <CloserAvail closerId={closer.id} />
          </DialogContent>
        </Dialog>
        <Button size="icon" variant="ghost" onClick={() => del.mutate()}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function CloserAvail({ closerId }: { closerId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["closer-avail", closerId],
    queryFn: () => listCloserAvailability({ data: { closer_id: closerId } }),
  });
  const [byDay, setByDay] = useState<Record<number, Rule[]>>(() => {
    const m: Record<number, Rule[]> = {};
    for (const r of data) (m[r.day_of_week] ??= []).push({ day_of_week: r.day_of_week, start_minute: r.start_minute, end_minute: r.end_minute });
    return m;
  });

  // hydrate when data arrives
  const dataKey = data.map(r => `${r.day_of_week}-${r.start_minute}-${r.end_minute}`).join("|");
  useStateSyncToByDay(data, setByDay, dataKey);

  const save = useMutation({
    mutationFn: () => {
      const rules: Rule[] = [];
      for (const list of Object.values(byDay)) for (const r of list) if (r.end_minute > r.start_minute) rules.push(r);
      return replaceCloserAvailability({ data: { closer_id: closerId, rules } });
    },
    onSuccess: () => {
      toast.success("Availability saved");
      qc.invalidateQueries({ queryKey: ["closer-avail", closerId] });
      qc.invalidateQueries({ queryKey: ["closer-slots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      {DAYS.map((label, dow) => {
        const enabled = !!byDay[dow];
        const ranges = byDay[dow] ?? [];
        return (
          <div key={dow} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={enabled} onCheckedChange={(v) => setByDay((b) => {
                  const next = { ...b };
                  if (v) next[dow] = next[dow]?.length ? next[dow] : [{ day_of_week: dow, start_minute: 9*60, end_minute: 17*60 }];
                  else delete next[dow];
                  return next;
                })} />
                <div className="font-medium w-12">{label}</div>
              </div>
              {enabled && (
                <Button size="sm" variant="ghost" onClick={() => setByDay((b) => ({ ...b, [dow]: [...(b[dow] ?? []), { day_of_week: dow, start_minute: 9*60, end_minute: 17*60 }] }))}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              )}
            </div>
            {enabled && (
              <div className="mt-2 space-y-2">
                {ranges.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input type="time" value={toTime(r.start_minute)} step={1800}
                      onChange={(e) => setByDay((b) => { const list = [...(b[dow] ?? [])]; list[idx] = { ...list[idx], start_minute: fromTime(e.target.value) }; return { ...b, [dow]: list }; })}
                      className="w-32" />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" value={toTime(r.end_minute)} step={1800}
                      onChange={(e) => setByDay((b) => { const list = [...(b[dow] ?? [])]; list[idx] = { ...list[idx], end_minute: fromTime(e.target.value) }; return { ...b, [dow]: list }; })}
                      className="w-32" />
                    <Button size="icon" variant="ghost" onClick={() => setByDay((b) => {
                      const list = (b[dow] ?? []).filter((_, i) => i !== idx);
                      const next = { ...b }; if (list.length === 0) delete next[dow]; else next[dow] = list; return next;
                    })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
        <Save className="h-4 w-4 mr-1" /> Save availability
      </Button>
    </div>
  );
}


function useStateSyncToByDay(
  data: Array<{ day_of_week: number; start_minute: number; end_minute: number }>,
  setByDay: React.Dispatch<React.SetStateAction<Record<number, Rule[]>>>,
  key: string,
) {
  useEffect(() => {
    const m: Record<number, Rule[]> = {};
    for (const r of data) (m[r.day_of_week] ??= []).push({ day_of_week: r.day_of_week, start_minute: r.start_minute, end_minute: r.end_minute });
    setByDay(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
