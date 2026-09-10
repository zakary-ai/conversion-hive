import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPifPayments,
  syncPifPaymentsNow,
  updatePifPayment,
  deletePifPayment,
} from "@/lib/api/pif-payments.functions";
import { PageHeader, StatCard } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, DollarSign, CalendarClock, AlertTriangle, Check, Repeat, Trash2, Pencil, Mail } from "lucide-react";
import { CollectionsEmailsDialog } from "@/components/admin/collections-emails-dialog";

export const Route = createFileRoute("/app/_authenticated/admin/pif-payments")({
  component: PifPaymentsPage,
});

type Row = {
  id: string;
  person_name: string | null;
  amount_due: number | null;
  due_date: string | null;
  payment_method: string | null;
  recurrence_note: string | null;
  notes: string | null;
  status: string;
  needs_review: boolean;
  raw_text: string;
  posted_at: string | null;
};

const money = (n: number | null) =>
  n == null ? "-" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
const prettyDay = (s: string) =>
  parseDay(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function PifPaymentsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["pif-payments"], queryFn: () => listPifPayments() });
  const rows = (data?.rows ?? []) as Row[];
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const [editing, setEditing] = useState<Row | null>(null);

  const sync = useMutation({
    mutationFn: () => syncPifPaymentsNow(),
    onSuccess: (r) => {
      toast.success(`Synced: ${r.created} new, ${r.updated} updated`);
      qc.invalidateQueries({ queryKey: ["pif-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "due" | "paid" | "skipped" }) => updatePifPayment({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pif-payments"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePifPayment({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["pif-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dated = rows.filter((r) => r.due_date);
  const recurring = rows.filter((r) => !r.due_date && r.recurrence_note);
  const review = rows.filter((r) => r.needs_review && !r.recurrence_note && !r.due_date);

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of dated) {
      const key = r.due_date!;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [dated]);

  const todayKey = dayKey(new Date());
  const outstanding = dated.filter((r) => r.status === "due");
  const overdue = outstanding.filter((r) => r.due_date! < todayKey);
  const upcoming = outstanding
    .filter((r) => r.due_date! >= todayKey)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const totalDue = outstanding.reduce((s, r) => s + Number(r.amount_due ?? 0), 0);

  const dueDays = useMemo(() => dated.filter((r) => r.status === "due").map((r) => parseDay(r.due_date!)), [dated]);
  const paidDays = useMemo(() => dated.filter((r) => r.status === "paid").map((r) => parseDay(r.due_date!)), [dated]);
  const selectedRows = selected ? (byDay.get(dayKey(selected)) ?? []) : [];

  const lastSync = data?.sync?.last_synced_at
    ? new Date(data.sync.last_synced_at).toLocaleString()
    : "never";

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Payments due"
        description="Pulled automatically from the #pif-dm Slack channel."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "Checking Slack..." : "Refresh from Slack"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Last checked: {lastSync}
          {data?.sync?.last_status === "error" && data.sync.last_error ? ` - ${data.sync.last_error}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Outstanding" value={money(totalDue)} icon={DollarSign} />
        <StatCard label="Overdue" value={String(overdue.length)} icon={AlertTriangle} />
        <StatCard label="Upcoming" value={String(upcoming.length)} icon={CalendarClock} />
        <StatCard label="Payment plans" value={String(recurring.length)} icon={Repeat} />
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
      {error && <Card className="p-4 text-sm text-destructive">{(error as Error).message}</Card>}

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="p-2 w-fit">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            modifiers={{ due: dueDays, paid: paidDays }}
            modifiersClassNames={{
              due: "bg-warning/20 text-warning font-semibold",
              paid: "bg-success/20 text-success font-semibold",
            }}
          />
        </Card>

        <div className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
            {selected ? selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Pick a day"}
          </h2>
          {selectedRows.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nothing due this day.</Card>
          )}
          {selectedRows.map((r) => (
            <PaymentCard
              key={r.id}
              row={r}
              onEdit={() => setEditing(r)}
              onStatus={(status) => setStatus.mutate({ id: r.id, status })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </div>
      </div>

      {overdue.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-destructive">Overdue</h2>
          {overdue.map((r) => (
            <PaymentCard
              key={r.id}
              row={r}
              showDate
              onEdit={() => setEditing(r)}
              onStatus={(status) => setStatus.mutate({ id: r.id, status })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Upcoming</h2>
        {upcoming.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No upcoming payments.</Card>
        )}
        {upcoming.map((r) => (
          <PaymentCard
            key={r.id}
            row={r}
            showDate
            onEdit={() => setEditing(r)}
            onStatus={(status) => setStatus.mutate({ id: r.id, status })}
            onDelete={() => remove.mutate(r.id)}
          />
        ))}
      </section>

      {recurring.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Payment plans (no fixed date)</h2>
          {recurring.map((r) => (
            <PaymentCard
              key={r.id}
              row={r}
              onEdit={() => setEditing(r)}
              onStatus={(status) => setStatus.mutate({ id: r.id, status })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </section>
      )}

      {review.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-warning">Needs a due date</h2>
          {review.map((r) => (
            <PaymentCard
              key={r.id}
              row={r}
              onEdit={() => setEditing(r)}
              onStatus={(status) => setStatus.mutate({ id: r.id, status })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </section>
      )}

      <EditDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PaymentCard({
  row,
  showDate,
  onEdit,
  onStatus,
  onDelete,
}: {
  row: Row;
  showDate?: boolean;
  onEdit: () => void;
  onStatus: (status: "due" | "paid" | "skipped") => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{row.person_name || "Unknown name"}</span>
        <span className="font-semibold">{money(row.amount_due)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {showDate && row.due_date && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> {prettyDay(row.due_date)}
          </span>
        )}
        {row.payment_method && <Badge variant="outline" className="text-[10px]">{row.payment_method}</Badge>}
        <Badge
          variant="outline"
          className={`text-[10px] ${row.status === "paid" ? "text-success" : row.status === "skipped" ? "" : "text-warning"}`}
        >
          {row.status}
        </Badge>
        {row.recurrence_note && (
          <span className="inline-flex items-center gap-1">
            <Repeat className="h-3 w-3" /> {row.recurrence_note}
          </span>
        )}
      </div>
      {row.notes && <div className="text-xs text-muted-foreground break-words">{row.notes}</div>}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Slack post</summary>
        <pre className="mt-1 whitespace-pre-wrap break-words font-sans">{row.raw_text}</pre>
      </details>
      <div className="flex flex-wrap gap-2">
        {row.status !== "paid" ? (
          <Button size="sm" variant="outline" onClick={() => onStatus("paid")}>
            <Check className="h-3 w-3 mr-1" /> Mark paid
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onStatus("due")}>
            Mark unpaid
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3 w-3 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

function EditDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", amount: "", date: "", method: "", plan: "", notes: "" });

  useEffect(() => {
    if (!row) return;
    setForm({
      name: row.person_name ?? "",
      amount: row.amount_due == null ? "" : String(row.amount_due),
      date: row.due_date ?? "",
      method: row.payment_method ?? "",
      plan: row.recurrence_note ?? "",
      notes: row.notes ?? "",
    });
  }, [row]);

  const save = useMutation({
    mutationFn: () =>
      updatePifPayment({
        data: {
          id: row!.id,
          person_name: form.name.trim() || null,
          amount_due: form.amount.trim() === "" ? null : Number(form.amount),
          due_date: form.date.trim() === "" ? null : form.date,
          payment_method: form.method.trim() || null,
          recurrence_note: form.plan.trim() || null,
          notes: form.notes.trim() || null,
          needs_review: false,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["pif-payments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount due</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment method</Label>
            <Input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment plan note</Label>
            <Input
              value={form.plan}
              placeholder="e.g. $100 every 2 weeks until paid off"
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
