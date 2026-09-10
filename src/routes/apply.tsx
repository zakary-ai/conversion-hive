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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  GraduationCap,
  PhoneCall,
  LifeBuoy,
  LayoutGrid,
  MessagesSquare,
  Users,
  TrendingUp,
  Quote,
  Target,
  MessageCircle,
  Star,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import testimonialAsset from "@/assets/testimonial.mp4.asset.json";
import testimonial2Asset from "@/assets/testimonial2.mp4.asset.json";
import vslAsset from "@/assets/scarlett-vsl.mp4.asset.json";

export const Route = createFileRoute("/apply")({
  validateSearch: z.object({
    dm: z.string().min(1).max(80).optional(),
    reapply: z.string().uuid().optional(),
  }).parse,
  head: () => ({
    meta: [
      { title: "Build Your Own Income Stream - Conversion Lab Business Certification" },
      { name: "description", content: "Join the Conversion Lab Business Certification Program and start earning from day one. No experience required. 5-star certification curriculum with dedicated coaching." },
      { property: "og:title", content: "Build Your Own Income Stream Under a Proven Brand - No Experience Required" },
      { property: "og:description", content: "Join the Conversion Lab Business Certification Program and start earning from day one." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

const WHAT_YOU_GET = [
  { icon: Target, text: "A personalized scalability plan built specifically for you" },
  { icon: MessageCircle, text: "Direct access to the CEO - text anytime" },
  { icon: GraduationCap, text: "Dedicated coach doing exactly what she teaches" },
  { icon: Star, text: "5 star certification curriculum" },
  { icon: PhoneCall, text: "2-3 live group coaching calls per week" },
  { icon: Users, text: "One on one coaching session per week dedicated to you" },
  { icon: LayoutGrid, text: "Access to the Conversion Lab app with everything you need in one place" },
  { icon: TrendingUp, text: "A progressive community that unlocks as you advance through each star" },
];

const HOW_IT_WORKS = [
  "Book your interview to see if you qualify",
  "Enroll and get immediate access to everything",
  "Run your program and start earning from day one",
  "Complete your 5 star certification and scale",
];

const FAQS = [
  {
    q: "Do I need experience?",
    a: "No. Scarlett and Suhanna both started with zero experience and made over $1,000 and $2,000 respectively in their very first week.",
  },
  {
    q: "How much can I make?",
    a: "Earnings depend entirely on your effort and consistency. There is no income guarantee outside of our refund policy. What we can tell you is that people who show up and follow the program see results fast.",
  },
  {
    q: "How long is the program?",
    a: "The certification program consists of 5 stars. Your coach determines when you are ready to advance. There is no fixed timeline - you move at the pace your competency develops.",
  },
  {
    q: "Who is my coach?",
    a: "Your dedicated coach is Caryn - an active high ticket sales professional making $4,000-$8,000 per month doing exactly what she teaches.",
  },
];

function ApplyPage() {
  const { dm: dmSlug, reapply: reapplyToken } = Route.useSearch();
  const pageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const vslRef = useRef<HTMLVideoElement>(null);
  const [vslMuted, setVslMuted] = useState(true);
  const [step, setStep] = useState<Step>(reapplyToken ? "book" : "form");
  const [appInfo, setAppInfo] = useState<{ id: string; token: string } | null>(
    reapplyToken ? { id: "reapply", token: reapplyToken } : null,
  );

  const unmuteVsl = () => {
    const v = vslRef.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play();
    setVslMuted(false);
  };

  const { data: dmSetter } = useQuery({
    queryKey: ["dm-slug", dmSlug],
    queryFn: () => resolveDmSlug({ data: { slug: dmSlug! } }),
    enabled: !!dmSlug,
  });

  const reapplyQuery = useQuery({
    queryKey: ["reapply", reapplyToken],
    queryFn: () => resolveReapplyToken({ data: { token: reapplyToken! } }),
    enabled: !!reapplyToken,
    retry: false,
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

  const scrollToBooking = useCallback(() => {
    bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#apply") return;
    requestAnimationFrame(scrollToBooking);
  }, [scrollToBooking]);

  return (
    <div ref={pageRef} className="min-h-dvh overflow-x-clip bg-background text-foreground">
      {/* HERO */}
      <section className="px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="mx-auto w-full max-w-3xl text-center space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Conversion Lab · Business Certification Program</p>
          <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight leading-[1.05]">
            Build Your Own Income Stream Under a Proven Brand -{" "}
            <span className="text-primary">No Experience Required</span>
          </h1>
          <p className="mx-auto max-w-xl text-base sm:text-lg text-muted-foreground">
            Join the Conversion Lab Business Certification Program and start earning from day one.
          </p>

          {/* VSL */}
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <div className="relative">
              <video
                src={vslAsset.url}
                autoPlay
                muted
                loop
                playsInline
                controls
                preload="metadata"
                ref={vslRef}
                className="aspect-video w-full"
              />
              {vslMuted && (
                <button
                  type="button"
                  onClick={unmuteVsl}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
                  aria-label="Click to unmute"
                >
                  <span className="animate-pulse rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg ring-2 ring-primary/40">
                    Click to unmute
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button size="lg" className="h-12 px-8 text-base font-semibold" onClick={scrollToBooking}>
              Book Your Interview Now
            </Button>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="border-y border-border bg-muted/30 px-4 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-2xl space-y-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">Testimonials</h2>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Real People. Real Results. First Week.</p>
          <Card className="p-8 text-left">
            <Quote className="h-8 w-8 text-primary/40" />
            <blockquote className="mt-4 text-lg sm:text-xl font-medium leading-relaxed">
              "Scarlett joined with zero sales experience and made over $1,000 in her very first week."
            </blockquote>
          </Card>
          <Card className="p-8 text-left">
            <Quote className="h-8 w-8 text-primary/40" />
            <blockquote className="mt-4 text-lg sm:text-xl font-medium leading-relaxed">
              "Suhanna joined and made over $2,000 in her very first week working about 2 hours a day."
            </blockquote>
          </Card>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <video
              src={testimonialAsset.url}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full"
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <video
              src={testimonial2Asset.url}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full"
            />
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Here's Everything Included</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {WHAT_YOU_GET.map(({ icon: Icon, text }) => (
              <Card key={text} className="flex items-start gap-3 p-5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm leading-relaxed">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-border bg-muted/30 px-4 py-14 sm:py-20">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Simple. Straightforward. Proven.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {HOW_IT_WORKS.map((stepText, i) => (
              <Card key={stepText} className="flex items-start gap-4 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {i + 1}
                </div>
                <p className="text-sm font-medium leading-relaxed pt-1.5">{stepText}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto w-full max-w-2xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-base font-medium">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* REFUND POLICY */}
      <section className="border-y border-border bg-muted/30 px-4 py-14 sm:py-20">
        <div className="mx-auto w-full max-w-2xl space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">We Stand Behind This</h2>
          <Card className="p-8 text-left space-y-4">
            <p className="text-lg font-medium leading-relaxed">
              If you do the work and don't make $5,000 profit within 4 months - we refund you everything.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No games. No fine print. We only win when you win.
            </p>
          </Card>
        </div>
      </section>

      {/* FINAL CTA + BOOKING */}
      <section id="apply" ref={bookRef} className="scroll-mt-6 px-4 py-14 sm:py-20">
        <div className="mx-auto w-full max-w-2xl space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Ready to Get Started?</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Spots are limited. We only take people we believe can succeed.
            </p>
            <div className="pt-2">
              <Button size="lg" className="h-12 px-8 text-base font-semibold" onClick={scrollToBooking}>
                Book Your Interview Now
              </Button>
            </div>
          </div>

          {/* APPLICATION FORM */}
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

          {reapplyToken && reapplyQuery.isError && (
            <Card className="p-8 text-center bg-card border-border">
              <h2 className="text-2xl font-display font-semibold">Link expired</h2>
              <p className="mt-3 text-muted-foreground">
                {reapplyQuery.error instanceof Error ? reapplyQuery.error.message : "This reapply link is no longer valid."}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Please <a className="text-primary underline" href="/apply">apply again</a> to book a new time.</p>
            </Card>
          )}

          {reapplyToken && reapplyQuery.isLoading && (
            <Card className="p-8 text-center bg-card border-border text-sm text-muted-foreground">Loading…</Card>
          )}

          {step === "book" && appInfo && !reapplyToken && (
            <BookingStep
              mode="new"
              appId={appInfo.id}
              token={appInfo.token}
              onBooked={() => setStep("done")}
            />
          )}

          {step === "book" && reapplyToken && reapplyQuery.data && (
            <div className="space-y-3">
              <Card className="p-4 bg-primary/10 border-primary/30 text-sm">
                Welcome back{reapplyQuery.data.full_name ? `, ${reapplyQuery.data.full_name}` : ""} - pick a new time below.
              </Card>
              <BookingStep
                mode="reapply"
                appId={reapplyQuery.data.application_id}
                token={reapplyToken}
                onBooked={() => setStep("done")}
              />
            </div>
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

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Conversion Lab. Results vary - no income is guaranteed outside of our refund policy.
          </p>
        </div>
      </section>
    </div>
  );
}

const COMMON_TZS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Sydney",
];

function BookingStep({ appId, token, onBooked, mode = "new" }: { appId: string; token: string; onBooked: () => void; mode?: "new" | "reapply" }) {
  const detected = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    [],
  );
  const [tz, setTz] = useState<string>(detected);
  const tzOptions = useMemo(() => {
    const set = new Set<string>([detected, ...COMMON_TZS]);
    return Array.from(set);
  }, [detected]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, "0" as unknown as number, 0, 0);
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
    mutationFn: (iso: string) =>
      mode === "reapply"
        ? createReapplyBooking({ data: { token, slot_start: iso } })
        : createCloserBooking({ data: { application_id: appId, token, slot_start: iso } }),
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
        <div className="rounded-xl border border-border bg-card p-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Your time zone</Label>
          <Select value={tz} onValueChange={(v) => { setTz(v); setPicked(null); }}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tzOptions.map((z) => (
                <SelectItem key={z} value={z}>{z.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">Times below are shown in this time zone.</p>
        </div>

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
