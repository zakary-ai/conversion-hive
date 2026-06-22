import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listClients, addCommission, deleteCommission } from "@/lib/api/cl.functions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const clientsOpts = queryOptions({ queryKey: ["clients"], queryFn: () => listClients() });

export const Route = createFileRoute("/app/_authenticated/admin/commissions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clientsOpts),
  component: AdminCommissions,
});

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
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: () => addCommission({ data: { user_id: userId, amount: parseFloat(amount), note } }),
    onSuccess: () => {
      toast.success("Commission added");
      setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["all-commissions"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteCommission({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["all-commissions"] }); },
  });

  const clientName = (uid: string) => clients.find((c) => c.user_id === uid)?.full_name ?? clients.find((c) => c.user_id === uid)?.email ?? uid.slice(0,8);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Commissions" />

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

      <Card className="overflow-x-auto">
        <div className="p-4 border-b border-border"><h3 className="font-display font-semibold">All entries</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Client</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Note</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No commissions.</td></tr>}
            {(list.data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="p-3">{clientName(c.user_id)}</td>
                <td className="p-3 font-medium text-success">${Number(c.amount).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                <td className="p-3 text-muted-foreground">{c.note || "—"}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => confirm("Remove?") && del.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
