import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Target, Zap, LineChart, CheckCircle2, XCircle, Phone, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { Capacitor } from "@capacitor/core";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      throw redirect({ to: "/app/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "Conversion Lab — Client acquisition systems for kitchen remodelers" },
      { name: "description", content: "We help kitchen remodelers turn ad spend into booked appointments and real revenue with a complete client acquisition system — not just leads." },
      { property: "og:title", content: "Conversion Lab — Client acquisition for kitchen remodelers" },
      { property: "og:description", content: "Predictable booked appointments for kitchen remodelers. Ads, follow-up, and sales process — built as one system." },
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
              <Link to="/apply">Book a call <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </nav>
        </header>

        {/* Hero */}
        <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
          <section className="flex flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Target className="h-3.5 w-3.5 text-primary" />
              Built for kitchen remodelers
            </div>
            <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">
              Stop buying leads.
              <br />
              <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                Start building a client acquisition system.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Most kitchen remodelers don't need another marketing agency. They need a predictable way to turn attention into booked appointments — and booked appointments into real revenue.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/apply">Book your strategy call <ArrowRight className="ml-2 h-4 w-4" /></Link>
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
                On paper, the ads are "working."
              </h2>
              <p className="mt-4 text-muted-foreground">
                Leads are coming in. Forms are being filled out. People are clicking. But in reality?
              </p>
            </div>
            <ul className="space-y-3">
              {[
                "Leads aren't becoming conversations",
                "Conversations aren't becoming appointments",
                "Appointments aren't turning into revenue",
                "The ad spend never justifies itself",
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
                We don't just run ads.
              </h2>
              <p className="mt-4 text-muted-foreground">
                We build the entire path from first impression to paying customer — three pieces, one system.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: Target,
                  title: "The campaign",
                  body: "Ad strategy, messaging, creative direction, targeting, and landing pages built around your offer and market — not templates.",
                },
                {
                  icon: Zap,
                  title: "The follow-up",
                  body: "Speed wins. New leads are contacted fast, tracked properly, and moved into a real conversation before they go cold or book with a competitor.",
                },
                {
                  icon: LineChart,
                  title: "The sales process",
                  body: "Leads don't sit in a spreadsheet. They're organized, followed up with, and pushed toward a clear next step — every time.",
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

          {/* Better questions */}
          <section className="mt-32 rounded-3xl border border-border bg-card/40 p-8 sm:p-12">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              We ask better questions.
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              "How do we get more leads?" is the wrong starting point. Real growth comes from answering the questions most agencies skip.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Who is the best type of client for your business?",
                "What offer would make that person take action now?",
                "What does follow-up look like in the first five minutes?",
                "What happens if they don't answer?",
                "How are calls booked?",
                "How do we know which campaigns actually produce revenue?",
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
                <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> You want a magic button where ads go live and customers show up with zero follow-up.</li>
                <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> You're not willing to look at your offer or sales process.</li>
                <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> You want random leads without a system to convert them.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
              <h3 className="font-display text-xl font-semibold">This is for you if…</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You do quality kitchen remodels and know your customers are valuable.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You want predictable, qualified opportunities — not lead-form spam.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You're ready to build a real system, not chase another quick fix.</li>
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
                One call. Zero pressure. You'll leave with a clear picture of where your biggest gaps are.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { icon: Phone, step: "01", title: "Audit", body: "We look at your offer, market, sales process, and what you've already tried." },
                { icon: Calendar, step: "02", title: "Map", body: "We map out the biggest gaps — ads, offer, follow-up, or the system connecting them." },
                { icon: TrendingUp, step: "03", title: "Plan", body: "You leave knowing whether paid campaigns make sense right now, and what needs to be in place." },
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
              Stop guessing with ads.
              <br />
              <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">Build a client acquisition system.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
              The kitchen remodelers who win with ads aren't the ones with the biggest budgets. They're the ones with the clearest offer, the fastest follow-up, and the best system for turning interest into appointments.
            </p>
            <div className="mt-10">
              <Button size="lg" asChild>
                <Link to="/apply">Book your strategy call <ArrowRight className="ml-2 h-4 w-4" /></Link>
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
