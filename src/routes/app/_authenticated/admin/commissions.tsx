import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listClients, addCommission, deleteCommission, approveCommission, updateCommission } from "@/lib/api/cl.functions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, CheckCircle2, Pencil } from "lucide-react";
import { toast } from "sonner";

const clientsOpts = queryOptions({ queryKey: ["clients"], queryFn: () => listClients() });

export const Route = createFileRoute("/app/_authenticated/admin/commissions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clientsOpts),
  component: AdminCommissions,
});

type CommissionRow = {
  id: string;
  user_id: string;
  amount: number | string;
  commission_percent: number | string | null;
  deal_amount: number | string | null;
  status: string | null;
  note: string | null;
  created_at: string;
  approved_at: string | null;
};

function AdminCommissions() {
  const { data: clients } = useSuspenseQuery(clientsOpts);
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const list = useQuery({
    queryKey: ["all-commissions"],
    queryFn: async () => {
      const { data } = await supabase.from("commissions").select("*").order("created_at", { ascending: false });
      return (data ?? []) as CommissionRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["all-commissions"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["my-commissions"] });
  };

  const add = useMutation({
    mutationFn: () => addCommission({ data: { user_id: userId, amount: parseFloat(amount), note } }),
    onSuccess: () => { toast.success("Commission added"); setAmount(""); setNote(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteCommission({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); invalidate(); },
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveCommission({ data: { id } }),
    onSuccess: () => { toast.success("Approved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const clientName = (uid: string) => clients.find((c) => c.user_id === uid)?.full_name ?? clients.find((c) => c.user_id === uid)?.email ?? uid.slice(0,8);

  const rows = list.data ?? [];
  const pending = rows.filter((r) => (r.status ?? "pending") === "pending");

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Commissions" />

      {pending.length > 0 && (
        <Card className="overflow-x-auto border-warning/40">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display font-semibold">Pending approval</h3>
            <Badge variant="secondary">{pending.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {pending.map((c) => (
              <CommissionRowItem key={c.id} row={c} clientName={clientName(c.user_id)} onApprove={() => approve.mutate(c.id)} onDelete={() => confirm("Remove?") && del.mutate(c.id)} onSaved={invalidate} />
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-3">Add commission</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Client</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.full_name || c.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Amount ($)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </div>
        <div className="mt-3"><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <Button onClick={() => add.mutate()} disabled={!userId || !amount || add.isPending} className="mt-3">Add commission</Button>
      </Card>

      <Card>
        <div className="p-4 border-b border-border"><h3 className="font-display font-semibold">All entries</h3></div>
        {rows.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No commissions.</div>}
        <div className="divide-y divide-border">
          {rows.map((c) => (
            <CommissionRowItem key={c.id} row={c} clientName={clientName(c.user_id)} onApprove={() => approve.mutate(c.id)} onDelete={() => confirm("Remove?") && del.mutate(c.id)} onSaved={invalidate} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function CommissionRowItem({ row, clientName, onApprove, onDelete, onSaved }: {
  row: CommissionRow;
  clientName: string;
  onApprove: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(row.amount ?? ""));
  const [pct, setPct] = useState(row.commission_percent != null ? String(row.commission_percent) : "");
  const [deal, setDeal] = useState(row.deal_amount != null ? String(row.deal_amount) : "");

  const save = useMutation({
    mutationFn: () => updateCommission({
      data: {
        id: row.id,
        amount: amount ? parseFloat(amount) : undefined,
        commission_percent: pct ? parseFloat(pct) : null,
        deal_amount: deal ? parseFloat(deal) : null,
      },
    }),
    onSuccess: () => { toast.success("Updated"); setEditing(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (row.status ?? "pending") as string;
  const isPending = status === "pending";

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{clientName}</span>
            {isPending ? (
              <Badge variant="outline" className="border-warning text-warning text-[10px]">Pending</Badge>
            ) : (
              <Badge variant="outline" className="border-success text-success text-[10px]">Approved</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(row.created_at).toLocaleDateString()}
            {row.note ? ` · ${row.note}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-success">${Number(row.amount).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
          {(row.commission_percent != null || row.deal_amount != null) && (
            <div className="text-[11px] text-muted-foreground">
              {row.deal_amount != null && `Deal $${Number(row.deal_amount).toFixed(2)}`}
              {row.commission_percent != null && row.deal_amount != null && " · "}
              {row.commission_percent != null && `${Number(row.commission_percent)}%`}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div><Label className="text-[10px]">Deal ($)</Label><Input type="number" step="0.01" value={deal} onChange={(e) => setDeal(e.target.value)} /></div>
          <div><Label className="text-[10px]">Percent (%)</Label><Input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
          <div><Label className="text-[10px]">Commission ($)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2 justify-end">
        {isPending && !editing && (
          <Button size="sm" onClick={onApprove}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve</Button>
        )}
        {editing ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
