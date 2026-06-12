import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getClientDetail, addCommission, setCommissionPaid } from "@/lib/api/cl.functions";
import { provisionNumberForUser, unassignUserNumber } from "@/lib/api/calls.functions";
import { PageHeader, StatCard, StatusPill } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, DollarSign, GraduationCap, CheckCircle2, XCircle, Clock, CalendarClock, BadgeCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Range = "day" | "week" | "month" | "90d" | "all";

export const Route = createFileRoute("/_authenticated/admin/clients/$userId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.userId, "all")),
  component: SetterDetailPage,
});

const opts = (id: string, range: Range) => queryOptions({
  queryKey: ["client-detail", id, range],
  queryFn: () => getClientDetail({ data: { user_id: id, range } }),
});

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Commission = {
  id: string;
  amount: number | string;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  paid_method: string | null;
};

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

function SetterDetailPage() {
  const { userId } = Route.useParams();
  const [range, setRange] = useState<Range>("all");
  const { data } = useSuspenseQuery(opts(userId, range));
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [payTarget, setPayTarget] = useState<Commission | null>(null);

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
        title={data.profile?.full_name || data.profile?.email || "Setter"}
        description={data.profile?.email ?? undefined}
        action={<Button variant="ghost" asChild><Link to="/admin/clients">← All setters</Link></Button>}
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {RANGES.map((r) => (
          <Button
            key={r.id}
            size="sm"
            variant={range === r.id ? "default" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Bookings" value={data.stats.bookings} icon={CalendarClock} />
        <StatCard label="Closed" value={data.stats.closed} icon={CheckCircle2} />
        <StatCard label="Lost" value={data.stats.lost} icon={XCircle} />
        <StatCard label="Leads" value={data.stats.leadsCount} icon={Briefcase} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Training" value={`${progress}%`} icon={GraduationCap} />
        <StatCard label="Total earned" value={money(data.balance)} icon={DollarSign} />
        <StatCard label="Paid out" value={money(data.paid)} icon={BadgeCheck} />
        <StatCard label="Unpaid" value={money(data.unpaid)} icon={Clock} />
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

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold">Booking history</h3>
          <span className="text-xs text-muted-foreground">{data.stats.bookings} total</span>
        </div>
        {data.stats.bookings === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No bookings yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.appointments.filter((a) => a.type === "booking").slice(0, 50).map((a) => (
              <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
                <div className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                  a.outcome === "closed" ? "bg-success/15 text-success" :
                  a.outcome === "lost" ? "bg-destructive/15 text-destructive" :
                  "bg-muted text-muted-foreground"
                )}>
                  {a.outcome === "closed" ? <CheckCircle2 className="h-4 w-4" /> :
                   a.outcome === "lost" ? <XCircle className="h-4 w-4" /> :
                   <Clock className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(a.scheduled_at)}</div>
                </div>
                <div className="text-right text-xs">
                  {a.outcome === "closed" && a.deal_amount != null && (
                    <div className="text-success font-medium">{money(Number(a.deal_amount))}</div>
                  )}
                  <div className="uppercase tracking-wider text-muted-foreground">
                    {a.outcome ?? "pending"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold">Commission history</h3>
          <div className="text-xs text-muted-foreground">
            {money(data.unpaid)} unpaid · {money(data.paid)} paid
          </div>
        </div>
        {data.commissions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No entries.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.commissions.map((c) => (
              <div key={c.id} className="p-3 flex items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.note || "—"}</div>
                  <div className="text-xs text-muted-foreground">Earned {fmtDate(c.created_at)}</div>
                  {c.paid_at && (
                    <div className="text-xs text-success mt-0.5 flex items-center gap-1">
                      <BadgeCheck className="h-3 w-3" /> Paid {fmtDate(c.paid_at)} · {c.paid_method}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <div className={cn("font-medium", c.paid_at ? "text-muted-foreground line-through" : "text-success")}>
                    {money(Number(c.amount))}
                  </div>
                  {c.paid_at ? (
                    <UnpayButton id={c.id} userId={userId} />
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPayTarget(c as Commission)}>
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-3">Quiz scores</h3>
        {data.attempts.length === 0 ? <div className="text-sm text-muted-foreground">No attempts yet.</div> : (
          <div className="space-y-2">
            {data.attempts.slice(0, 10).map((a) => (
              <div key={a.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <span>{(a as { modules?: { title?: string } }).modules?.title ?? "Module"}</span>
                <span className="font-medium">{a.score}% · {fmtDate(a.completed_at)}</span>
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

      <PayDialog
        commission={payTarget}
        userId={userId}
        onClose={() => setPayTarget(null)}
      />
    </div>
  );
}

function UnpayButton({ id, userId }: { id: string; userId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => setCommissionPaid({ data: { id, paid: false } }),
    onSuccess: () => {
      toast.success("Marked unpaid");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => m.mutate()} disabled={m.isPending}>
      <RotateCcw className="h-3 w-3 mr-1" /> Unpay
    </Button>
  );
}

const PAY_METHODS = ["Zelle", "Cash App", "Venmo", "PayPal", "Wire", "ACH", "Check", "Cash", "Other"];

function PayDialog({ commission, userId, onClose }: { commission: Commission | null; userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("Zelle");
  const [customMethod, setCustomMethod] = useState("");

  const m = useMutation({
    mutationFn: () => setCommissionPaid({
      data: {
        id: commission!.id,
        paid: true,
        paid_at: date,
        paid_method: method === "Other" ? (customMethod.trim() || "Other") : method,
      },
    }),
    onSuccess: () => {
      toast.success("Marked paid");
      qc.invalidateQueries({ queryKey: ["client-detail", userId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!commission} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Mark commission paid</DialogTitle></DialogHeader>
        {commission && (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3 text-sm">
              <div className="text-success font-semibold text-lg">{money(Number(commission.amount))}</div>
              <div className="text-xs text-muted-foreground">{commission.note || "—"}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid_at">Date paid</Label>
              <Input id="paid_at" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Payment method</Label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {method === "Other" && (
                <Input
                  placeholder="Specify method"
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  maxLength={100}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => m.mutate()} disabled={m.isPending || !date}>
                {m.isPending ? "Saving…" : "Mark paid"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
