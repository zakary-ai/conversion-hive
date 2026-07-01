import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listB2bClosers, createB2bCloser, updateB2bCloser, deleteB2bCloser,
  resendB2bCloserInvite, getB2bCloserZoomCreds, listB2bClosersZoomStatus,
} from "@/lib/api/b2b-closers.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Save, UserPlus, KeyRound, BarChart3 } from "lucide-react";
import { B2bCloserDetailDialog } from "@/components/admin/b2b-closer-detail-dialog";

export const Route = createFileRoute("/app/_authenticated/admin/b2b-closers")({
  component: B2bClosersPage,
});


function B2bClosersPage() {
  const qc = useQueryClient();
  const { data: closers = [] } = useQuery({ queryKey: ["b2b-closers"], queryFn: () => listB2bClosers() });
  const { data: zoomStatus = {} } = useQuery({ queryKey: ["b2b-closers-zoom-status"], queryFn: () => listB2bClosersZoomStatus() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "" });

  const create = useMutation({
    mutationFn: () => createB2bCloser({ data: form }),
    onSuccess: (res) => {
      toast.success(`B2B closer invited. Temp password: ${res.default_password}`, { duration: 15000 });
      qc.invalidateQueries({ queryKey: ["b2b-closers"] });
      setOpen(false);
      setForm({ full_name: "", email: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-semibold">B2B Closers</h1>
          <p className="text-sm text-muted-foreground">Closers that handle inbound B2B sales calls. Fully separate from the B2C pool.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 sm:size-default"><UserPlus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Invite B2B closer</span><span className="sr-only sm:hidden">Invite B2B closer</span></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a B2B closer</DialogTitle></DialogHeader>
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
          <Card className="p-8 text-center text-sm text-muted-foreground">No B2B closers yet. Invite one to get started.</Card>
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
};

function CloserRow({ closer, hasZoom }: { closer: CloserRowT; hasZoom: boolean }) {
  const qc = useQueryClient();
  const [editZoom, setEditZoom] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const toggleActive = useMutation({
    mutationFn: (active: boolean) => updateB2bCloser({ data: { id: closer.id, active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["b2b-closers"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => deleteB2bCloser({ data: { id: closer.id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["b2b-closers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resend = useMutation({
    mutationFn: () => resendB2bCloserInvite({ data: { id: closer.id } }),
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
          <span className="text-muted-foreground">Active</span>
          <Switch checked={closer.active} onCheckedChange={(v) => toggleActive.mutate(v)} />
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
        <Button size="sm" variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending ? "Sending…" : "Resend invite"}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => del.mutate()} aria-label="Remove closer">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <B2bCloserDetailDialog closerId={closer.id} open={detailOpen} onOpenChange={setDetailOpen} />
    </Card>
  );
}


function CloserZoomCreds({ closer, onDone }: { closer: CloserRowT; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: creds } = useQuery({
    queryKey: ["b2b-closer-zoom-creds", closer.id],
    queryFn: () => getB2bCloserZoomCreds({ data: { closer_id: closer.id } }),
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
    mutationFn: () => updateB2bCloser({
      data: {
        id: closer.id,
        zoom_account_id: accountId.trim() || null,
        zoom_client_id: clientId.trim() || null,
        zoom_client_secret: clientSecret.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Zoom credentials saved");
      qc.invalidateQueries({ queryKey: ["b2b-closers-zoom-status"] });
      qc.invalidateQueries({ queryKey: ["b2b-closer-zoom-creds", closer.id] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: () => updateB2bCloser({
      data: { id: closer.id, zoom_account_id: null, zoom_client_id: null, zoom_client_secret: null },
    }),
    onSuccess: () => {
      toast.success("Zoom credentials removed");
      qc.invalidateQueries({ queryKey: ["b2b-closers-zoom-status"] });
      qc.invalidateQueries({ queryKey: ["b2b-closer-zoom-creds", closer.id] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        From the B2B closer's Zoom Server-to-Server OAuth app. B2B meetings will be created on this account.
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
