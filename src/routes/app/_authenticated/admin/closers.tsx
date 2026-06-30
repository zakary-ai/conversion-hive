import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listClosers, createCloser, updateCloser, deleteCloser, listCloserAvailability, replaceCloserAvailability, resendCloserInvite, getCloserZoomCreds, listClosersZoomStatus } from "@/lib/api/b2c.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Plus, Save, UserPlus, KeyRound, BarChart3 } from "lucide-react";
import { CloserDetailDialog } from "@/components/closer-detail-dialog";

export const Route = createFileRoute("/app/_authenticated/admin/closers")({
  component: ClosersPage,
});

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
type Rule = { day_of_week: number; start_minute: number; end_minute: number };
type Track = "b2c" | "b2b";
const toTime = (m: number) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
const fromTime = (s: string) => { const [h,m] = s.split(":").map(Number); return (h||0)*60+(m||0); };

function ClosersPage() {
  const qc = useQueryClient();
  const { data: closers = [] } = useQuery({ queryKey: ["closers"], queryFn: () => listClosers() });
  const { data: zoomStatus = {} } = useQuery({ queryKey: ["closers-zoom-status"], queryFn: () => listClosersZoomStatus() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "" });

  const create = useMutation({
    mutationFn: () => createCloser({ data: form }),
    onSuccess: (res) => {
      toast.success(`Closer created. Temp password: ${res.default_password}`, { duration: 15000 });
      qc.invalidateQueries({ queryKey: ["closers"] });
      setOpen(false);
      setForm({ full_name: "", email: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-semibold">Closers</h1>
          <p className="text-sm text-muted-foreground">B2C closers. B2B closers are managed in their own section.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 sm:size-default"><UserPlus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Invite closer</span><span className="sr-only sm:hidden">Invite closer</span></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a closer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Login email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">Zoom credentials are added per-closer after invite via the "Zoom API" button.</p>
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
        {closers.map((c) => <CloserRow key={c.id} closer={c as CloserRowT} hasZoom={!!zoomStatus[c.id]} />)}
      </div>
    </div>
  );
}

type CloserRowT = {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  b2b_active?: boolean;
};

function CloserRow({ closer, hasZoom }: { closer: CloserRowT; hasZoom: boolean }) {
  const qc = useQueryClient();
  const [editAvail, setEditAvail] = useState(false);
  const [editZoom, setEditZoom] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const toggleActive = useMutation({
    mutationFn: (active: boolean) => updateCloser({ data: { id: closer.id, active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closers"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleB2B = useMutation({
    mutationFn: (b2b_active: boolean) => updateCloser({ data: { id: closer.id, b2b_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closers"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => deleteCloser({ data: { id: closer.id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["closers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resend = useMutation({
    mutationFn: () => resendCloserInvite({ data: { id: closer.id } }),
    onSuccess: () => toast.success(`Invite re-sent to ${closer.email}`),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <button type="button" onClick={() => setDetailOpen(true)} className="min-w-0 text-left group">
        <div className="font-medium truncate text-primary group-hover:underline">{closer.full_name}</div>
        <div className="text-xs text-muted-foreground truncate">{closer.email}</div>
        <div className="text-xs mt-1">
          <span className={hasZoom ? "text-emerald-600" : "text-amber-600"}>
            {hasZoom ? "Zoom API connected" : "Zoom API not set"}
          </span>
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">B2C</span>
          <Switch checked={closer.active} onCheckedChange={(v) => toggleActive.mutate(v)} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">B2B</span>
          <Switch checked={!!closer.b2b_active} onCheckedChange={(v) => toggleB2B.mutate(v)} />
        </div>
        <Button size="sm" variant="outline" onClick={() => setDetailOpen(true)}>
          <BarChart3 className="h-3.5 w-3.5 mr-1" /> Stats
        </Button>
        <Dialog open={editZoom} onOpenChange={setEditZoom}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><KeyRound className="h-3.5 w-3.5 mr-1" /> Zoom API</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{closer.full_name}'s Zoom API credentials</DialogTitle></DialogHeader>
            <CloserZoomCreds closer={closer} onDone={() => setEditZoom(false)} />
          </DialogContent>
        </Dialog>
        <Dialog open={editAvail} onOpenChange={setEditAvail}>
          <DialogTrigger asChild><Button size="sm" variant="outline">Availability</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{closer.full_name}'s availability</DialogTitle></DialogHeader>
            <Tabs defaultValue="b2c">
              <TabsList>
                <TabsTrigger value="b2c">B2C hours</TabsTrigger>
                <TabsTrigger value="b2b">B2B hours</TabsTrigger>
              </TabsList>
              <TabsContent value="b2c"><CloserAvail closerId={closer.id} track="b2c" /></TabsContent>
              <TabsContent value="b2b"><CloserAvail closerId={closer.id} track="b2b" /></TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending ? "Sending…" : "Resend invite"}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => del.mutate()} aria-label="Remove closer">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <CloserDetailDialog closerId={closer.id} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  );
}

function CloserAvail({ closerId, track }: { closerId: string; track: Track }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["closer-avail", closerId, track],
    queryFn: () => listCloserAvailability({ data: { closer_id: closerId, track } }),
  });
  const [byDay, setByDay] = useState<Record<number, Rule[]>>({});

  const rowsKey = (data as Array<{ day_of_week: number; start_minute: number; end_minute: number }>)
    .map((r) => `${r.day_of_week}-${r.start_minute}-${r.end_minute}`).join("|");
  useEffect(() => {
    const m: Record<number, Rule[]> = {};
    for (const r of (data as Array<{ day_of_week: number; start_minute: number; end_minute: number }>)) {
      (m[r.day_of_week] ??= []).push({ day_of_week: r.day_of_week, start_minute: r.start_minute, end_minute: r.end_minute });
    }
    setByDay(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const save = useMutation({
    mutationFn: () => {
      const rules: Rule[] = [];
      for (const list of Object.values(byDay)) for (const r of list) if (r.end_minute > r.start_minute) rules.push(r);
      return replaceCloserAvailability({ data: { closer_id: closerId, rules, track } });
    },
    onSuccess: () => {
      toast.success("Availability saved");
      qc.invalidateQueries({ queryKey: ["closer-avail", closerId, track] });
      qc.invalidateQueries({ queryKey: ["closer-slots"] });
      qc.invalidateQueries({ queryKey: ["available-slots"] });
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


function CloserZoomCreds({ closer, onDone }: { closer: CloserRowT; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: creds } = useQuery({
    queryKey: ["closer-zoom-creds", closer.id],
    queryFn: () => getCloserZoomCreds({ data: { closer_id: closer.id } }),
  });
  const [accountId, setAccountId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  useEffect(() => {
    if (creds) {
      setAccountId(creds.zoom_account_id ?? "");
      setClientId(creds.zoom_client_id ?? "");
      setClientSecret(creds.zoom_client_secret ?? "");
    }
  }, [creds]);

  const save = useMutation({
    mutationFn: () => updateCloser({
      data: {
        id: closer.id,
        zoom_account_id: accountId.trim() || null,
        zoom_client_id: clientId.trim() || null,
        zoom_client_secret: clientSecret.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Zoom credentials saved");
      qc.invalidateQueries({ queryKey: ["closers-zoom-status"] });
      qc.invalidateQueries({ queryKey: ["closer-zoom-creds", closer.id] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: () => updateCloser({
      data: { id: closer.id, zoom_account_id: null, zoom_client_id: null, zoom_client_secret: null },
    }),
    onSuccess: () => {
      toast.success("Zoom credentials removed");
      qc.invalidateQueries({ queryKey: ["closers-zoom-status"] });
      qc.invalidateQueries({ queryKey: ["closer-zoom-creds", closer.id] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        From the closer's Zoom Server-to-Server OAuth app. Meetings for this closer will be created on their own Zoom account (used for both B2C and B2B).
      </p>
      <div>
        <Label>Account ID</Label>
        <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Zoom Account ID" />
      </div>
      <div>
        <Label>Client ID</Label>
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Zoom Client ID" />
      </div>
      <div>
        <Label>Client Secret</Label>
        <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Zoom Client Secret" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
        <Button variant="outline" onClick={() => clear.mutate()} disabled={clear.isPending}>
          Clear
        </Button>
      </div>
    </div>
  );
}
