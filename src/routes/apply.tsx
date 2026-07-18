import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { submitB2cApplication, listCloserSlotsForDate, createCloserBooking, getPublicBookingWindow, resolveReapplyToken, createReapplyBooking } from "@/lib/api/b2c.functions";
import { resolveDmSlug } from "@/lib/api/dm-setters.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, CalendarCheck, DollarSign, Sparkles, CheckCircle2, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

export const Route = createFileRoute("/apply")({
  validateSearch: z.object({
    dm: z.string().min(1).max(80).optional(),
    reapply: z.string().uuid().optional(),
  }).parse,
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

const CURRENT_INCOME = ["Under $1,500", "$1,500-$3,000", "$3,000-$5,000", "$5,000+"] as const;
const DESIRED_INCOME = ["$3,000-$5,000", "$5,000-$8,000", "$8,000-$12,000", "$12,000+"] as const;
const CREDIT = ["Below 600", "600-650", "650-700", "700-750", "750-800", "800-850"] as const;
type Credit = typeof CREDIT[number];
const REFERRERS = ["Tyler", "Eli", "Bailie", "Lucas"] as const;
type Referrer = typeof REFERRERS[number];

type Step = "form" | "book" | "done";

function toDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function ApplyPage() {
  const { dm: dmSlug } = Route.useSearch();
  const pageRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("form");
  const [appInfo, setAppInfo] = useState<{ id: string; token: string } | null>(null);

  const { data: dmSetter } = useQuery({
    queryKey: ["dm-slug", dmSlug],
    queryFn: () => resolveDmSlug({ data: { slug: dmSlug! } }),
    enabled: !!dmSlug,
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    current_monthly_income: "",
    desired_monthly_income: "",
    credit_score_range: "" as Credit | "",
    referred_by: "" as Referrer | "",
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => submitB2cApplication({ data: {
      full_name: form.full_name,
      phone: form.phone,
      email: form.email.trim() || null,
      current_monthly_income: form.current_monthly_income,
      desired_monthly_income: form.desired_monthly_income,
      credit_score_range: form.credit_score_range as Credit,
      referred_by: dmSlug ? null : (form.referred_by || null),
      dm_slug: dmSlug ?? null,
    } }),
    onSuccess: (res) => {
      setAppInfo({ id: res.id, token: res.token });
      setStep("book");
    },
    onError: (e: Error) => setError(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.full_name.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.current_monthly_income &&
    form.desired_monthly_income &&
    form.credit_score_range &&
    (dmSlug ? true : form.referred_by);

  const scrollToApply = useCallback(() => {
    const scroller = pageRef.current;
    const target = document.getElementById("apply");
    if (!target) return;

    if (scroller) {
      scroller.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.history.replaceState(null, "", "#apply");
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#apply") return;
    requestAnimationFrame(scrollToApply);
  }, [scrollToApply]);

  return (
    <div ref={pageRef} className="mobile-app-scroll h-dvh min-h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground">
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
          <Button size="lg" className="mt-8" type="button" onClick={scrollToApply}>
            Apply now
          </Button>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-4 grid md:grid-cols-3 gap-6">
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

      <section id="apply" className="max-w-2xl mx-auto px-6 pt-8 pb-24 scroll-mt-8">
        {step === "form" && (
          <Card className="p-8 bg-card border-border">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-display font-semibold">Apply now</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Takes under 2 minutes. You'll book your call right after.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Full name</Label>
                <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
              </div>
              <div>
                <Label>Phone number</Label>
                <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div>
                <Label>How much do you earn monthly?</Label>
                <Select value={form.current_monthly_income} onValueChange={(v) => set("current_monthly_income", v)}>
                  <SelectTrigger><SelectValue placeholder="Select a range" /></SelectTrigger>
                  <SelectContent>
                    {CURRENT_INCOME.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>How much do you want to earn monthly?</Label>
                <Select value={form.desired_monthly_income} onValueChange={(v) => set("desired_monthly_income", v)}>
                  <SelectTrigger><SelectValue placeholder="Select a range" /></SelectTrigger>
                  <SelectContent>
                    {DESIRED_INCOME.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>What is your credit score?</Label>
                <Select value={form.credit_score_range} onValueChange={(v) => set("credit_score_range", v as Credit)}>
                  <SelectTrigger><SelectValue placeholder="Select a range" /></SelectTrigger>
                  <SelectContent>
                    {CREDIT.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {dmSlug ? (
                <div>
                  <Label>Referred by</Label>
                  <div className="mt-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                    {dmSetter?.full_name ?? (dmSlug ? "Loading…" : "")}
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Referred by</Label>
                  <Select value={form.referred_by} onValueChange={(v) => set("referred_by", v as Referrer)}>
                    <SelectTrigger><SelectValue placeholder="Who referred you?" /></SelectTrigger>
                    <SelectContent>
                      {REFERRERS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}


              <Button
                size="lg"
                className="w-full"
                disabled={!valid || submit.isPending}
                onClick={() => { setError(null); submit.mutate(); }}
              >
                {submit.isPending ? "Submitting…" : "Submit application"}
              </Button>
            </div>
          </Card>
        )}

        {step === "book" && appInfo && (
          <BookingStep
            appId={appInfo.id}
            token={appInfo.token}
            onBooked={() => setStep("done")}
          />
        )}

        {step === "done" && (
          <Card className="p-10 text-center">
            <div className="h-14 w-14 mx-auto rounded-full bg-success/20 text-success flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-display font-semibold">You're booked</h2>
            <p className="mt-3 text-muted-foreground">
              Thanks! We'll send a calendar invite shortly with the call details.
            </p>
          </Card>
        )}
      </section>

    </div>
  );
}

function BookingStep({ appId, token, onBooked }: { appId: string; token: string; onBooked: () => void }) {
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    [],
  );
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: window } = useQuery({
    queryKey: ["public-booking-window"],
    queryFn: () => getPublicBookingWindow(),
  });

  const horizonEnd = useMemo(() => {
    const days = window?.days_out ?? 14;
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  }, [window?.days_out, today]);

  const estDow = (d: Date) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(name);
  };

  const isDayClosed = (d: Date) => {
    if (!window) return false;
    if (window.open_weekdays === null) return false;
    return !window.open_weekdays.includes(estDow(d));
  };

  const dateKey = date ? toDateKey(date, tz) : null;
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["public-closer-slots", dateKey, tz],
    queryFn: () => listCloserSlotsForDate({ data: { date: dateKey!, tz } }),
    enabled: !!dateKey,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });


  const book = useMutation({
    mutationFn: (iso: string) => createCloserBooking({ data: {
      application_id: appId, token, slot_start: iso,
    } }),
    onSuccess: () => onBooked(),
    onError: (e: Error) => setErr(e.message),
  });

  const tzLabel = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

  return (
    <Card className="p-6 bg-card border-border">
      <div className="text-center mb-5">
        <h2 className="text-2xl font-display font-semibold">Book your call</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a time that works for you. The call takes about 30 minutes.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-card p-2 flex justify-center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => { if (d) { setDate(d); setPicked(null); } }}
            disabled={(d) => d < today || d > horizonEnd || isDayClosed(d)}
            toDate={horizonEnd}

            className="pointer-events-auto"
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 text-sm font-medium min-w-0">
              <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">
                {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Pick a date"}
              </span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">{tzLabel}</div>
          </div>
          {!date && <div className="text-sm text-muted-foreground">Select a date to see open times.</div>}
          {date && isLoading && <div className="text-sm text-muted-foreground">Loading times…</div>}
          {date && !isLoading && slots.length === 0 && (
            <div className="text-sm text-muted-foreground">No open times this day.</div>
          )}
          {slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
              {slots.map((s) => {
                const d = new Date(s.iso);
                const selected = picked === s.iso;
                const label = new Intl.DateTimeFormat(undefined, {
                  timeZone: tz, hour: "numeric", minute: "2-digit",
                }).format(d);
                return (
                  <Button
                    key={s.iso}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setPicked(s.iso)}
                    className={cn("text-xs", selected && "ring-2 ring-primary")}
                  >
                    {label}
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
          disabled={!picked || book.isPending}
          onClick={() => { if (picked) { setErr(null); book.mutate(picked); } }}
        >
          {book.isPending ? "Booking…" : picked ? "Confirm booking" : "Pick a time"}
        </Button>
      </div>
    </Card>
  );
}
