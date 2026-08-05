import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  Headphones,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
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
      { title: "Conversion Lab — Sales training with a guaranteed role" },
      {
        name: "description",
        content:
          "Conversion Lab is a remote sales training program. Learn appointment setting and closing from working operators — and get placed into a guaranteed sales role the day you complete the program.",
      },
      { property: "og:title", content: "Conversion Lab — Sales training with a guaranteed role" },
      {
        property: "og:description",
        content:
          "Train on real calls, real scripts, and real pipeline. Complete the program and you're placed into a paid sales role — guaranteed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      {/* Ambient liquid-glass background */}
      <div className="relative min-h-dvh overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/35 blur-[120px]" />
          <div className="absolute top-1/3 -left-40 h-[30rem] w-[30rem] rounded-full bg-purple-500/30 blur-[120px]" />
          <div className="absolute bottom-0 -right-32 h-[34rem] w-[34rem] rounded-full bg-sky-400/25 blur-[130px]" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-30 px-4 pt-4">
          <header className="glass mx-auto flex max-w-6xl items-center justify-between rounded-full px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full glow-primary">
                <img src={logo} alt="Conversion Lab" className="h-full w-full object-cover" />
              </div>
              <span className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">
                Conversion Lab
              </span>
            </div>
            <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="sm" className="rounded-full" asChild>
                <Link to="/app/auth">Sign in</Link>
              </Button>
              <Button size="sm" className="rounded-full" asChild>
                <Link to="/apply">
                  Apply <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </nav>
          </header>
        </div>

        <main className="mx-auto max-w-6xl px-6 pb-24 pt-14 sm:pt-20">
          {/* Hero */}
          <section className="flex flex-col items-center text-center">
            <div className="glass mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Remote sales training · Guaranteed placement
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">
              Learn to sell.
              <br />
              <span className="bg-gradient-to-r from-primary via-sky-300 to-purple-400 bg-clip-text text-transparent">
                Finish with a role waiting.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Conversion Lab is a hands-on sales training program for people who want a real remote career.
              You learn appointment setting and closing from operators running live pipeline every day — and when
              you complete the program, you're placed into a paid sales role. Guaranteed.
            </p>
            <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Button size="lg" className="w-full rounded-full sm:w-auto" asChild>
                <Link to="/apply">
                  Apply to the program <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full rounded-full sm:w-auto" asChild>
                <Link to="/app/auth">Student sign in</Link>
              </Button>
            </div>

            {/* Glass stat strip */}
            <div className="mt-14 grid w-full gap-4 sm:grid-cols-3">
              {[
                { icon: ShieldCheck, stat: "Guaranteed role", label: "Placed on completion" },
                { icon: Headphones, stat: "Live call reviews", label: "Your calls, broken down" },
                { icon: Briefcase, stat: "100% remote", label: "Work from anywhere" },
              ].map(({ icon: Icon, stat, label }) => (
                <div key={stat} className="glass glass-sheen rounded-3xl p-5 text-left">
                  <Icon className="h-5 w-5 text-primary" />
                  <div className="mt-3 font-display text-lg font-semibold tracking-tight">{stat}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* The guarantee */}
          <section className="mt-28 sm:mt-32">
            <div className="glass-strong glass-sheen rounded-[2rem] p-8 sm:p-12">
              <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
                    <BadgeCheck className="h-3.5 w-3.5" /> The guarantee
                  </div>
                  <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                    Complete the program, get the role.
                  </h2>
                  <p className="mt-4 max-w-2xl text-muted-foreground">
                    We don't hand you a certificate and wish you luck. Conversion Lab trains sales talent for our own
                    sales floor and our partner companies — so finishing the program means stepping straight onto a
                    team with leads, scripts, and a manager who already knows your reps.
                  </p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[
                      "Show up, do the reps, hit the standard — you're placed",
                      "Paid role with commission from day one",
                      "Setter or closer track, based on where you're strongest",
                      "Ongoing coaching after you're placed",
                    ].map((item) => (
                      <li key={item} className="glass flex items-start gap-3 rounded-2xl p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="glass mx-auto flex h-40 w-40 shrink-0 flex-col items-center justify-center rounded-full text-center">
                  <GraduationCap className="h-8 w-8 text-primary" />
                  <div className="mt-2 font-display text-sm font-semibold leading-tight">
                    Finish
                    <br />
                    = Hired
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* What you learn */}
          <section className="mt-28 sm:mt-32">
            <div className="text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                What you actually learn
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                No theory-only modules. You learn the skills a sales floor pays for, in the order you'll use them.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: PhoneCall,
                  title: "Appointment setting",
                  body: "Openers, tonality, objection handling, and follow-up discipline. You'll run live dials with your calls recorded and reviewed until the basics are automatic.",
                },
                {
                  icon: Target,
                  title: "Discovery & closing",
                  body: "How to run a real sales conversation — qualify properly, build urgency honestly, present the offer, and close without pressure games.",
                },
                {
                  icon: TrendingUp,
                  title: "Pipeline & consistency",
                  body: "CRM habits, follow-up cadences, and the daily numbers that separate reps who spike from reps who compound month after month.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="glass glass-sheen rounded-3xl p-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section className="mt-28 sm:mt-32">
            <div className="text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                How the program runs
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Apply, train, get placed. Everything happens inside one app — modules, call reviews, and your live pipeline.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-4">
              {[
                { step: "01", title: "Apply", body: "Short application and an intro call so we can see whether you're coachable and serious." },
                { step: "02", title: "Train", body: "Video modules, scripts, and quizzes you work through at your own pace inside the app." },
                { step: "03", title: "Reps", body: "Live calls with real leads. Your recordings get reviewed and you get direct feedback." },
                { step: "04", title: "Placed", body: "Hit the completion standard and you're onboarded into a paid sales role on a team." },
              ].map(({ step, title, body }) => (
                <div key={step} className="glass rounded-3xl p-6">
                  <span className="font-mono text-xs text-primary">{step}</span>
                  <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Fit */}
          <section className="mt-28 grid gap-6 sm:mt-32 md:grid-cols-2">
            <div className="glass rounded-3xl border-destructive/25 p-6">
              <h3 className="font-display text-xl font-semibold">This isn't for you if…</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {[
                  "You're looking for passive income with no phone time.",
                  "You won't take feedback on your own recorded calls.",
                  "You expect a role without meeting the completion standard.",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass rounded-3xl border-primary/25 p-6">
              <h3 className="font-display text-xl font-semibold">This is for you if…</h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {[
                  "You want a remote career with income tied to your effort.",
                  "You're willing to make calls every day and get coached hard.",
                  "You'd rather be trained by people still selling than by a course.",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Final CTA */}
          <section className="glass-strong glass-sheen mt-28 rounded-[2rem] p-8 text-center sm:mt-32 sm:p-16">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              No experience required.
              <br />
              <span className="bg-gradient-to-r from-primary via-sky-300 to-purple-400 bg-clip-text text-transparent">
                A role guaranteed on completion.
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
              Cohorts are limited because every student gets their calls reviewed personally. If you're ready to learn a
              skill that pays for the rest of your career, start with the application.
            </p>
            <div className="mt-10">
              <Button size="lg" className="rounded-full" asChild>
                <Link to="/apply">
                  Apply to the program <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </main>

        <footer className="px-4 pb-6">
          <div className="glass mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 rounded-3xl px-6 py-5 text-xs text-muted-foreground sm:flex-row">
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
