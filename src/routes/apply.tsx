import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  submitB2cApplication,
  listCloserSlotsForDate,
  createCloserBooking,
} from "@/lib/api/b2c.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GraduationCap, CalendarCheck, DollarSign, Sparkles, CheckCircle2, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Apply Now — Remote Sales Opportunity" },
      { name: "description", content: "Join a team of driven remote sales pros. Training included. Apply in under 2 minutes." },
      { property: "og:title", content: "Apply Now — Remote Sales Opportunity" },
      { property: "og:description", content: "Driven sales people wanted. Training included, commissions uncapped." },
    ],
  }),
  component: ApplyPage,
});

type Invest = "Yes" | "No" | "Maybe";
type Credit = "600-650" | "650-700" | "700-750" | "750-800" | "800-850";
type Step = "form" | "book" | "done";

function toDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function ApplyPage() {
  const [step, setStep] = useState<Step>("form");
  const [appCtx, setAppCtx] = useState<{ id: string; token: string } | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    why_remote_sales: "",
    current_monthly_income: "",
    desired_monthly_income: "",
    open_to_invest: "" as Invest | "",
    credit_score_range: "" as Credit | "",
  });
  const [error, setError] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: () => submitB2cApplication({ data: {
      ...form,
      open_to_invest: form.open_to_invest as Invest,
      credit_score_range: form.credit_score_range as Credit,
    } }),
    onSuccess: ({ id, token }) => {
      setAppCtx({ id, token });
      setStep("book");
      requestAnimationFrame(() => {
        document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    onError: (e: Error) => setError(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.full_name.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.why_remote_sales.trim() &&
    form.current_monthly_income.trim() &&
    form.desired_monthly_income.trim() &&
    form.open_to_invest &&
    form.credit_score_range;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs uppercase tracking-widest text-primary mb-6">
            <Sparkles className="h-3 w-3" /> Now hiring
          </div>
          <h1 className="text-5xl md:text-6xl font-display font-semibold tracking-tight">Apply Now</h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            We're looking for driven sales people, or those looking to get into the sales industry. Training is included — you bring the hunger, we'll give you the skills.
          </p>
          <a href="#apply">
            <Button size="lg" className="mt-8">Apply now</Button>
          </a>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        {[
          { icon: GraduationCap, title: "Training Included", body: "Hands-on coaching in high-ticket sales, objection handling, and closing frameworks." },
          { icon: CalendarCheck, title: "Appointment Setting", body: "The more appointments you set the more bonuses you will make." },
          { icon: DollarSign, title: "Earn Commission", body: "Performance-based pay with top reps clearing 5-figures per month." },
        ].map((f) => (
          <Card key={f.title} className="p-6 bg-card border-border">
            <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-4">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </Card>
        ))}
      </section>

      <section id="apply" className="max-w-2xl mx-auto px-6 pb-24">
        {step === "form" && (
          <Card className="p-8 bg-card border-border">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-display font-semibold">Apply now</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Takes under 2 minutes. You'll pick your interview time right after.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Full name</Label>
                <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Phone number</Label>
                  <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Why do you want to get into remote sales?</Label>
                <Textarea rows={4} value={form.why_remote_sales} onChange={(e) => set("why_remote_sales", e.target.value)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>How much do you earn monthly?</Label>
                  <Input value={form.current_monthly_income} onChange={(e) => set("current_monthly_income", e.target.value)} />
                </div>
                <div>
                  <Label>How much do you want to earn monthly?</Label>
                  <Input value={form.desired_monthly_income} onChange={(e) => set("desired_monthly_income", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Are you open to invest into yourself to get there?</Label>
                <Select value={form.open_to_invest} onValueChange={(v) => set("open_to_invest", v as Invest)}>
                  <SelectTrigger><SelectValue placeholder="Select an answer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Maybe">Maybe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>What is your credit score?</Label>
                <Select value={form.credit_score_range} onValueChange={(v) => set("credit_score_range", v as Credit)}>
                  <SelectTrigger><SelectValue placeholder="Select a range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="600-650">600-650</SelectItem>
                    <SelectItem value="650-700">650-700</SelectItem>
                    <SelectItem value="700-750">700-750</SelectItem>
                    <SelectItem value="750-800">750-800</SelectItem>
                    <SelectItem value="800-850">800-850</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                size="lg"
                className="w-full"
                disabled={!valid || mutate.isPending}
                onClick={() => { setError(null); mutate.mutate(); }}
              >
                {mutate.isPending ? "Submitting…" : "Submit & pick interview time"}
              </Button>
            </div>
          </Card>
        )}

        {step === "book" && appCtx && (
          <InlineBooking
            applicationId={appCtx.id}
            token={appCtx.token}
            onDone={() => setStep("done")}
          />
        )}

        {step === "done" && (
          <Card className="p-10 text-center">
            <div className="h-14 w-14 mx-auto rounded-full bg-success/20 text-success flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-display font-semibold">You're booked!</h2>
            <p className="mt-3 text-muted-foreground">
              We received your booking. You'll receive a confirmation email with the Zoom link as soon as a closer is assigned.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}

function InlineBooking({
  applicationId, token, onDone,
}: { applicationId: string; token: string; onDone: () => void }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

  // Allowed booking window: 1–3 days from today (inclusive).
  const windowDays = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return [1, 2, 3].map((offset) => {
      const d = new Date(base);
      d.setDate(d.getDate() + offset);
      return d;
    });
  }, []);

  const [date, setDate] = useState<Date>(windowDays[0]);
  const [selected, setSelected] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dateKey = toDateKey(date, tz);
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["closer-slots", dateKey, tz],
    queryFn: () => listCloserSlotsForDate({ data: { date: dateKey, tz } }),
  });

  useEffect(() => { setSelected(null); }, [dateKey]);

  const book = useMutation({
    mutationFn: () => createCloserBooking({ data: {
      application_id: applicationId, token, slot_start: selected!.toISOString(),
    } }),
    onSuccess: () => onDone(),
    onError: (e: Error) => setErr(e.message),
  });

  const tzLabel = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

  return (
    <Card className="p-6 space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs uppercase tracking-widest text-primary mb-3">
          <Sparkles className="h-3 w-3" /> Application received
        </div>
        <h2 className="text-2xl font-display font-semibold">Pick your interview time</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a 30-minute slot in the next 3 days. We'll email you the Zoom link.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {windowDays.map((d) => {
          const active = toDateKey(d, tz) === dateKey;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => setDate(d)}
              className={cn(
                "rounded-xl border p-3 text-center transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="text-lg font-display font-semibold">
                {d.toLocaleDateString(undefined, { day: "numeric" })}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {d.toLocaleDateString(undefined, { month: "short" })}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 text-sm font-medium min-w-0">
            <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">
              {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{tzLabel}</div>
        </div>
        {isLoading && <div className="text-sm text-muted-foreground">Loading times…</div>}
        {!isLoading && slots.length === 0 && (
          <div className="text-sm text-muted-foreground">No open times this day. Try another date above.</div>
        )}
        {slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {slots.map(({ iso, capacity }) => {
              const d = new Date(iso);
              const isSel = selected && d.getTime() === selected.getTime();
              const label = new Intl.DateTimeFormat(undefined, {
                timeZone: tz, hour: "numeric", minute: "2-digit",
              }).format(d);
              return (
                <Button
                  key={iso}
                  type="button"
                  size="sm"
                  variant={isSel ? "default" : "outline"}
                  onClick={() => setSelected(d)}
                  className={cn("text-xs flex flex-col h-auto py-2", isSel && "ring-2 ring-primary")}
                >
                  <span>{label}</span>
                  <span className="text-[9px] text-muted-foreground">{capacity} left</span>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      <Button
        size="lg"
        className="w-full"
        disabled={!selected || book.isPending}
        onClick={() => { setErr(null); book.mutate(); }}
      >
        {book.isPending ? "Booking…" : selected ? "Confirm booking" : "Pick a time"}
      </Button>
    </Card>
  );
}
