import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  LayoutGrid,
  MessageCircle,
  PhoneCall,
  Quote,
  Star,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import logo from "@/assets/logo.png";
import testimonialAsset from "@/assets/testimonial.mp4.asset.json";
import testimonial2Asset from "@/assets/testimonial2.mp4.asset.json";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      throw redirect({ to: "/app/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Business Certification Program | Conversion Lab" },
      {
        name: "description",
        content: "Build your own income stream under a proven brand with the Conversion Lab Business Certification Program. No experience required.",
      },
      { property: "og:title", content: "Conversion Lab Business Certification Program" },
      { property: "og:description", content: "Build your own income stream under a proven brand. No experience required." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const WHAT_YOU_GET = [
  { icon: Target, text: "A personalized scalability plan built specifically for you" },
  { icon: MessageCircle, text: "Direct access to the CEO" },
  { icon: GraduationCap, text: "A dedicated coach doing exactly what she teaches" },
  { icon: Star, text: "A 5 star certification curriculum" },
  { icon: PhoneCall, text: "2 to 3 live group coaching calls per week" },
  { icon: Users, text: "A one on one coaching session dedicated to you each week" },
  { icon: LayoutGrid, text: "The Conversion Lab app with everything in one place" },
  { icon: TrendingUp, text: "A progressive community that unlocks as you advance" },
];

const STEPS = [
  "Book your interview to see if you qualify",
  "Enroll and get immediate access to everything",
  "Run your program and start earning from day one",
  "Complete your 5 star certification and scale",
];

const FAQS = [
  {
    q: "Do I need experience?",
    a: "No. The program is designed to teach you the skills, systems, and daily actions you need from the ground up.",
  },
  {
    q: "How much can I make?",
    a: "Earnings depend on your effort, consistency, and performance. Results vary from person to person.",
  },
  {
    q: "How long is the program?",
    a: "The certification consists of 5 stars. Your coach determines when you are ready to advance, so you move at the pace your competency develops.",
  },
  {
    q: "Who is my coach?",
    a: "Your dedicated coach is Caryn, an active high ticket sales professional who teaches the same work she does every day.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 px-4 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={logo} alt="Conversion Lab" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            <span className="truncate font-display text-base font-semibold sm:text-lg">Conversion Lab</span>
          </div>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Main navigation">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/auth">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/apply">Apply <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="px-4 pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div className="mx-auto w-full max-w-3xl space-y-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Conversion Lab · Business Certification Program</p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
              Build Your Own Income Stream Under a Proven System
              <span className="mt-2 block text-primary">No Experience Required</span>
            </h1>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
              Join the Conversion Lab Business Certification Program, learn a proven system, and start building your business from day one.
            </p>

            <Button size="lg" className="h-12 px-8 text-base font-semibold" asChild>
              <Link to="/apply">Book Your Interview Now <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30 px-4 py-14 sm:py-16">
          <div className="mx-auto w-full max-w-3xl space-y-6 text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Testimonials</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Real People. Real Results.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Scarlett joined with zero sales experience and made over $1,000 in her very first week.",
                "Suhanna joined and made over $2,000 in her very first week working about 2 hours a day.",
              ].map((quote) => (
                <Card key={quote} className="p-6 text-left">
                  <Quote className="h-7 w-7 text-primary/40" />
                  <blockquote className="mt-4 text-base font-medium leading-relaxed">“{quote}”</blockquote>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[testimonialAsset, testimonial2Asset].map((asset) => (
                <div key={asset.url} className="overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <video src={asset.url} controls playsInline preload="metadata" className="aspect-video w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-20">
          <div className="mx-auto w-full max-w-4xl space-y-8">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Here&apos;s Everything Included</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {WHAT_YOU_GET.map(({ icon: Icon, text }) => (
                <Card key={text} className="flex items-start gap-3 p-5">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm leading-relaxed">{text}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30 px-4 py-14 sm:py-20">
          <div className="mx-auto w-full max-w-4xl space-y-8">
            <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Simple. Straightforward. Proven.</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Card key={step} className="p-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</div>
                  <p className="mt-4 text-sm font-medium leading-relaxed">{step}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-20">
          <div className="mx-auto w-full max-w-2xl space-y-8">
            <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((faq, index) => (
                <AccordionItem key={faq.q} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left text-base font-medium">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="border-t border-border bg-muted/30 px-4 py-16 text-center sm:py-20">
          <div className="mx-auto max-w-2xl">
            <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-5 font-display text-3xl font-bold sm:text-4xl">Ready to Get Started?</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Spots are limited. We only take people we believe can succeed.</p>
            <Button size="lg" className="mt-8 h-12 px-8 text-base font-semibold" asChild>
              <Link to="/apply">Book Your Interview Now <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} Conversion Lab. Results vary.</div>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/support" className="hover:text-foreground">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}