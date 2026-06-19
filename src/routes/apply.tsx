import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { submitB2cApplication } from "@/lib/api/b2c.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, CalendarCheck, DollarSign, Sparkles, CheckCircle2 } from "lucide-react";

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

const CURRENT_INCOME = ["Under $1,500", "$1,500-$3,000", "$3,000-$5,000", "$5,000+"] as const;
const DESIRED_INCOME = ["$3,000-$5,000", "$5,000-$8,000", "$8,000-$12,000", "$12,000+"] as const;
const CREDIT = ["Below 600", "600-650", "650-700", "700-750", "750-800", "800-850"] as const;
type Credit = typeof CREDIT[number];

type Step = "form" | "done";

function ApplyPage() {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    current_monthly_income: "",
    desired_monthly_income: "",
    credit_score_range: "" as Credit | "",
  });
  const [error, setError] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: () => submitB2cApplication({ data: {
      full_name: form.full_name,
      phone: form.phone,
      email: form.email.trim() || null,
      current_monthly_income: form.current_monthly_income,
      desired_monthly_income: form.desired_monthly_income,
      credit_score_range: form.credit_score_range as Credit,
    } }),
    onSuccess: () => setStep("done"),
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
                Takes under 2 minutes. You will receive a phone call within 24 hours.
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

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                size="lg"
                className="w-full"
                disabled={!valid || mutate.isPending}
                onClick={() => { setError(null); mutate.mutate(); }}
              >
                {mutate.isPending ? "Submitting…" : "Submit application"}
              </Button>
            </div>
          </Card>
        )}

        {step === "done" && (
          <Card className="p-10 text-center">
            <div className="h-14 w-14 mx-auto rounded-full bg-success/20 text-success flex items-center justify-center mb-4">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-display font-semibold">Application submitted</h2>
            <p className="mt-3 text-muted-foreground">
              Thanks! You will receive a phone call within 24 hours.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
