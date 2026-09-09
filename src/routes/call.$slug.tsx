import { createFileRoute, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPublicManagerBySlug, listPublicManagerSlots, bookPublicManagerSlot } from "@/lib/api/dm-manager.functions";
import testimonialAsset from "@/assets/testimonial.mp4.asset.json";
import vslAsset from "@/assets/scarlett-vsl.mp4.asset.json";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
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
} from "lucide-react";

export const Route = createFileRoute("/call/$slug")({
  loader: async ({ params }) => {
    const manager = await getPublicManagerBySlug({ data: { slug: params.slug } });
    if (!manager) throw notFound();
    return manager;
  },
  head: ({ loaderData }) => {
    const who = loaderData?.managerName ?? "Conversion Lab";
    return {
      meta: [
        { title: "Get Paid to Learn Sales · Conversion Lab" },
        { name: "description", content: `Join the Conversion Lab DM Setter program and start earning from day one under a proven brand. Book your interview with ${who}.` },
        { property: "og:title", content: "Get Paid to Learn Sales - No Experience Required" },
        { property: "og:description", content: "Join the Conversion Lab DM Setter program and start earning from day one under a proven brand." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <main className="min-h-dvh w-full bg-background px-4 py-10">
      <p className="mx-auto max-w-4xl text-sm text-muted-foreground">Something went wrong loading this page. Please refresh and try again.</p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="min-h-dvh w-full bg-background px-4 py-10">
      <p className="mx-auto max-w-4xl text-sm text-muted-foreground">This booking link isn't active anymore.</p>
    </main>
  ),
  component: ManagerBookingPage,
});

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const WHAT_YOU_GET = [
  { icon: GraduationCap, text: "Video modules created by your coach walking you through exactly what to do" },
  { icon: PhoneCall, text: "2–3 live group coaching calls per week" },
  { icon: LifeBuoy, text: "24/7 direct support from your coach" },
  { icon: LayoutGrid, text: "Access to the Conversion Lab app with everything you need in one place" },
  { icon: MessagesSquare, text: "A live DM setter position - start booking calls from day one" },
  { icon: Users, text: "A community of people on the same path as you" },
  { icon: TrendingUp, text: "The opportunity to grow within the Conversion Lab ecosystem based on your performance" },
];

const HOW_IT_WORKS = [
  "Book your interview to see if you qualify",
  "Enroll and get immediate access to everything",
  "Complete your training and start booking calls",
  "Get paid",
];

const FAQS = [
  {
    q: "Do I need experience?",
    a: "No. Margot started with zero experience and made $600 in her very first week.",
  },
  {
    q: "How much can I make?",
    a: "Earnings depend entirely on your effort. There is no income guarantee. What we can tell you is that people who show up consistently and follow the program see results fast.",
  },
  {
    q: "How long is the program?",
    a: "60 days. After completion you can continue as a DM setter or explore promotional opportunities within Conversion Lab based on your performance.",
  },
];

function ManagerBookingPage() {
  const { slug, managerName } = Route.useLoaderData();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bookRef = useRef<HTMLDivElement>(null);
  const vslRef = useRef<HTMLVideoElement>(null);
  const [vslMuted, setVslMuted] = useState(true);
  const unmuteVsl = () => {
    const v = vslRef.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.play();
    setVslMuted(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [day, setDay] = useState<Date | undefined>(new Date());
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [done, setDone] = useState<{ label: string } | null>(null);

  const date = day ? keyOf(day) : keyOf(new Date());
  const slots = useQuery({
    queryKey: ["public-manager-slots", slug, date],
    queryFn: () => listPublicManagerSlots({ data: { slug, date } }),
  });

  const book = useMutation({
    mutationFn: () =>
      bookPublicManagerSlot({
        data: {
          slug,
          scheduled_at: slot!,
          timezone: tz,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
        },
      }),
    onSuccess: (res) => setDone({ label: res.scheduled_label }),
  });

  const scrollToBooking = () => bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (done) {
    return (
      <main className="min-h-dvh w-full bg-background px-4 py-10">
        <Card className="mx-auto max-w-md p-8 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold font-display">You're booked</h1>
          <p className="text-sm text-muted-foreground">{done.label}</p>
          <p className="text-sm text-muted-foreground">
            An invite with the meeting link is on its way to {form.email}.
          </p>
        </Card>
      </main>
    );
  }

  const canBook = !!slot && form.name.trim().length > 1 && /\S+@\S+\.\S+/.test(form.email.trim());
  const dayLabel = day ? day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";

  return (
    <main className="min-h-dvh w-full bg-background">
      {/* HERO */}
      <section className="px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="mx-auto w-full max-w-3xl text-center space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Conversion Lab · DM Setter Program</p>
          <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight leading-[1.05]">
            Get Paid to Learn Sales -{" "}
            <span className="text-primary">No Experience Required</span>
          </h1>
          <p className="mx-auto max-w-xl text-base sm:text-lg text-muted-foreground">
            Join the Conversion Lab DM Setter program and start earning from day one under a proven brand.
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
              "Margot came in with zero experience and made $600 profit in her very first week as a DM setter."
            </blockquote>
            <p className="mt-4 text-sm text-muted-foreground">- Conversion Lab DM Setter</p>
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
            {HOW_IT_WORKS.map((step, i) => (
              <Card key={step} className="flex items-start gap-4 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {i + 1}
                </div>
                <p className="text-sm font-medium leading-relaxed pt-1.5">{step}</p>
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

      {/* FINAL CTA + BOOKING */}
      <section ref={bookRef} className="scroll-mt-6 border-t border-border bg-muted/30 px-4 py-14 sm:py-20">
        <div className="mx-auto w-full max-w-4xl space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Ready to Get Started?</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Spots are limited. We only take people we believe can succeed.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="grid md:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex justify-center border-b p-3 md:border-b-0 md:border-r">
                <Calendar
                  mode="single"
                  selected={day}
                  onSelect={(d: Date | undefined) => { setDay(d ?? undefined); setSlot(null); }}
                  disabled={{ before: today }}
                  className="[--cell-size:2.4rem]"
                />
              </div>
              <div className="min-w-0 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  {dayLabel || "Pick a day"}
                </div>
                {!day ? (
                  <p className="py-6 text-sm text-muted-foreground">Select a date to see available times.</p>
                ) : slots.isLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading times…
                  </div>
                ) : (slots.data ?? []).length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No times left on this day - try another date.</p>
                ) : (
                  <div className="mt-3 grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                    {(slots.data ?? []).map((iso) => (
                      <Button
                        key={iso}
                        type="button"
                        size="sm"
                        variant={slot === iso ? "default" : "outline"}
                        onClick={() => setSlot(iso)}
                      >
                        {new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  30-minute interview{managerName ? ` with ${managerName}` : ""} · Times in your timezone ({tz})
                </p>
              </div>
            </div>
          </Card>

          {slot && (
            <Card className="mx-auto max-w-2xl p-5 space-y-3">
              <p className="text-sm font-medium">
                Your details ·{" "}
                <span className="text-muted-foreground">
                  {dayLabel} at {new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </p>
              <div>
                <Label>Full name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone number</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>

              {book.isError && <p className="text-sm text-destructive">{(book.error as Error).message}</p>}

              <Button className="w-full" disabled={!canBook || book.isPending} onClick={() => book.mutate()}>
                {book.isPending ? "Booking…" : "Confirm booking"}
              </Button>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Conversion Lab. Results vary - no income is guaranteed.
          </p>
        </div>
      </section>
    </main>
  );
}
