import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Linkedin, Users, MessageSquare, Calendar, CheckCircle2, XCircle, Handshake, TrendingUp, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { Capacitor } from "@capacitor/core";

const CALENDLY_URL = "https://calendly.com/zakary-deleo/conversion-lab-onboarding";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      throw redirect({ to: "/app/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Conversion Lab — LinkedIn connection systems for contractors" },
      { name: "description", content: "We build contractors a LinkedIn connection-making system that turns real relationships into booked strategy calls and signed projects — no cold ads, no lead-form spam." },
      { property: "og:title", content: "Conversion Lab — LinkedIn client acquisition for contractors" },
      { property: "og:description", content: "The best leads come from connections. We build contractors a LinkedIn automation system that turns your network into booked calls." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <div className="min-h-dvh bg-[radial-gradient(circle_at_top,oklch(0.20_0.05_260)_0%,var(--background)_60%)]">
        {/* Header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 overflow-hidden rounded-xl glow-primary">
              <img src={logo} alt="Conversion Lab" className="h-full w-full object-cover" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">Conversion Lab</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/app/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">Book a call <ArrowRight className="ml-1 h-4 w-4" /></a>
            </Button>
          </nav>
        </header>

        {/* Hero */}
        <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
          <section className="flex flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Linkedin className="h-3.5 w-3.5 text-primary" />
              Built for contractors
            </div>
            <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">
              The best jobs don't come from ads.
              <br />
              <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                They come from connections.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              We build contractors a LinkedIn connection-making system that turns real relationships — developers, GCs, architects, property managers, and homeowners — into booked strategy calls and signed projects.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">Book your strategy call <ArrowRight className="ml-2 h-4 w-4" /></a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/app/auth">Sign in</Link>
              </Button>
            </div>
          </section>

          {/* Problem */}
          <section className="mt-32 grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Cold ads don't build contractors.
              </h2>
              <p className="mt-4 text-muted-foreground">
                You already know it — the jobs that actually move the needle come from someone who knew someone. But you can't scale a coffee meeting.
              </p>
            </div>
            <ul className="space-y-3">
              {[
                "Lead forms flood you with tire-kickers and price shoppers",
                "Referrals are great, but unpredictable and impossible to forecast",
                "You don't have time to sit on LinkedIn all day sending messages",
                "The right decision-makers are on LinkedIn — you're just not reaching them",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-4">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Solution — 3 pillars */}
          <section className="mt-32">
            <div className="text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                A connection-making system, on autopilot.
              </h2>
              <p className="mt-4 text-muted-foreground">
                We build the entire path from stranger on LinkedIn to booked strategy call — three pieces, one system.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: Network,
                  title: "Targeting",
                  body: "We identify the exact decision-makers worth knowing in your market — developers, GCs, architects, property managers, high-net-worth homeowners — and build lists of the right people to connect with.",
                },
                {
                  icon: Handshake,
                  title: "Connection automation",
                  body: "Your LinkedIn quietly sends personalized connection requests and follow-ups every day. No spam, no bots — just a steady stream of new, relevant relationships being built in the background.",
                },
                {
                  icon: Calendar,
                  title: "Booked calls",
                  body: "Warm conversations get routed to your calendar with a clear next step. You spend your time on real opportunities, not chasing cold leads.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Why LinkedIn */}
          <section className="mt-32 rounded-3xl border border-border bg-card/40 p-8 sm:p-12">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Why LinkedIn, and why now.
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              Every developer, GC, architect, and property owner worth working with is already on LinkedIn. Most contractors aren't. That's the opening.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "You reach the actual decision-maker — not a form submission",
                "Your name shows up before the project even goes out to bid",
                "Every connection compounds — your network grows every single day",
                "You stop competing on price and start competing on relationship",
                "Zero ad spend — the platform itself is the distribution",
                "It runs whether you're on a jobsite, on vacation, or asleep",
              ].map((q) => (
                <div key={q} className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm">{q}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Who it's for */}
          <section className="mt-32 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
              <h3 className="font-display text-xl font-semibold">This isn't for you if…</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> You want cheap, transactional leads at any cost.</li>
                <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> You're not willing to have real conversations with real people.</li>
                <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> You expect signed contracts in week one with zero involvement.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
              <h3 className="font-display text-xl font-semibold">This is for you if…</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You run a contracting business and do work you're proud of.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You want to be top-of-mind with developers, GCs, and decision-makers.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You'd rather build a network that pays you for years than buy a lead once.</li>
              </ul>
            </div>
          </section>

          {/* How it works */}
          <section className="mt-32">
            <div className="text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                How the strategy call works
              </h2>
              <p className="mt-4 text-muted-foreground">
                One call. Zero pressure. You'll leave with a clear picture of what your LinkedIn could be doing for you.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { icon: Users, step: "01", title: "Audit", body: "We look at your business, who your ideal clients really are, and what your current LinkedIn presence is (or isn't) doing." },
                { icon: MessageSquare, step: "02", title: "Map", body: "We map out the exact people worth connecting with and the messaging that will actually get replies from decision-makers." },
                { icon: TrendingUp, step: "03", title: "Plan", body: "You leave with a clear plan for what a connection-making system would look like for your business — and whether it fits." },
              ].map(({ icon: Icon, step, title, body }) => (
                <div key={step} className="rounded-2xl border border-border bg-card/60 p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{step}</span>
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Final CTA */}
          <section className="mt-32 rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card/60 to-card/40 p-8 text-center sm:p-16">
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Stop buying leads.
              <br />
              <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">Start building connections.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
              The contractors who win the next decade aren't the ones with the biggest ad budgets. They're the ones with the strongest networks — and they built them on purpose.
            </p>
            <div className="mt-10">
              <Button size="lg" asChild>
                <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">Book your strategy call <ArrowRight className="ml-2 h-4 w-4" /></a>
              </Button>
            </div>
          </section>
        </main>

        <footer className="border-t border-border/50 bg-card/30">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
            <div>© {new Date().getFullYear()} Conversion Lab. All rights reserved.</div>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground">Terms</Link>
              <Link to="/support" className="hover:text-foreground">Support</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
