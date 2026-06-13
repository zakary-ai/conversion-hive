import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Sign in — Conversion Lab" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(circle_at_top,oklch(0.20_0.05_260)_0%,var(--background)_55%)]">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary glow-primary flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-semibold tracking-tight">Conversion Lab</span>
        </div>
        <Card className="p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>Password</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
          </form>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Accounts are created by your admin. Check your email for an invite.
        </p>
        <p className="text-center text-xs text-muted-foreground mt-3">
          <a href="/privacy" className="hover:text-foreground hover:underline">Privacy</a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-foreground hover:underline">Terms</a>
        </p>
      </div>
    </div>
  );
}
