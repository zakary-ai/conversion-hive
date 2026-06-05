import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getClientDetail, addCommission } from "@/lib/api/cl.functions";
import { PageHeader, StatCard, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Briefcase, DollarSign, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/clients/$userId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.userId)),
  component: ClientDetailPage,
});

const opts = (id: string) => queryOptions({
  queryKey: ["client-detail", id],
  queryFn: () => getClientDetail({ data: { user_id: id } }),
});

function ClientDetailPage() {
  const { userId } = Route.useParams();
  const { data } = useSuspenseQuery(opts(userId));
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const add = useMutation({
    mutationFn: () => addCommission({ data: { user_id: userId, amount: parseFloat(amount), note } }),
    onSuccess: () => {
      toast.success("Commission added");
      setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });

  const progress = data.totalModules ? Math.round((data.completions.length / data.totalModules) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader
        title={data.profile?.full_name || data.profile?.email || "Client"}
        description={data.profile?.email}
        action={<Button variant="ghost" asChild><Link to="/admin/clients">← All clients</Link></Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Leads" value={data.leads.length} icon={Briefcase} />
        <StatCard label="Training" value={`${progress}%`} icon={GraduationCap} />
        <StatCard label="Quiz attempts" value={data.attempts.length} />
        <StatCard label="Commission" value={`$${data.balance.toLocaleString(undefined,{minimumFractionDigits:2})}`} icon={DollarSign} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="font-display font-semibold mb-3">Training progress</h3>
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground mt-2">{data.completions.length} of {data.totalModules} modules complete</div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-semibold mb-3">Add commission</h3>
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <Button onClick={() => add.mutate()} disabled={!amount || add.isPending} className="w-full mt-2">Add commission</Button>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-3">Quiz scores</h3>
        {data.attempts.length === 0 ? <div className="text-sm text-muted-foreground">No attempts yet.</div> : (
          <div className="space-y-2">
            {data.attempts.slice(0, 10).map((a) => (
              <div key={a.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <span>{(a as { modules?: { title?: string } }).modules?.title ?? "Module"}</span>
                <span className="font-medium">{a.score}% · {new Date(a.completed_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border"><h3 className="font-display font-semibold">Leads ({data.leads.length})</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Company</th><th className="text-left p-3">Status</th></tr>
          </thead>
          <tbody>
            {data.leads.slice(0, 20).map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="p-3">{l.name}</td>
                <td className="p-3 text-muted-foreground">{l.company}</td>
                <td className="p-3"><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-3">Commission history</h3>
        {data.commissions.length === 0 ? <div className="text-sm text-muted-foreground">No entries.</div> : (
          <div className="space-y-2">
            {data.commissions.map((c) => (
              <div key={c.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <div><div>{c.note || "—"}</div><div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</div></div>
                <div className="font-medium text-success">${Number(c.amount).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
