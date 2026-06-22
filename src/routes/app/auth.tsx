import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/auth")({
  head: () => ({ meta: [{ title: "Sign in — Conversion Lab" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      if (active) navigate({ to: isAdmin ? "/app/admin" : "/app/dashboard" });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !signIn.session) {
      setLoading(false);
      return toast.error(error?.message || "Sign-in failed");
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", signIn.session.user.id);
    setLoading(false);
    toast.success("Welcome back");
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const isCloser = (roles ?? []).some((r) => r.role === "closer");
    navigate({ to: isAdmin ? "/app/admin" : isCloser ? "/app/closer" : "/app/dashboard" });
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
