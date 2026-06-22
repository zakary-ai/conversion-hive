import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Conversion Lab — Sales training and lead management" },
      { name: "description", content: "A platform for high-performing sales teams to train setters, manage leads, and close more deals." },
      { property: "og:title", content: "Conversion Lab" },
      { property: "og:description", content: "Sales training and lead management platform." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <div className="min-h-dvh bg-[radial-gradient(circle_at_top,oklch(0.20_0.05_260)_0%,var(--background)_60%)]">
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
              <Link to="/apply">Apply <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </nav>
        </header>

        <main className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-24 text-center sm:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Built for elite sales teams
          </div>
          <h1 className="font-display text-5xl font-semibold tracking-tight sm:text-6xl">
            Train setters. Close deals.
            <br />
            <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Scale conversion.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Conversion Lab is the operating system for high-performing sales orgs — training,
            lead routing, calendars, and commission tracking in one place.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/apply">Apply to join <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/app/auth">Sign in</Link>
            </Button>
          </div>
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
