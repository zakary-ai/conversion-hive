import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw redirect({ to: "/auth" });
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", data.session.user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      throw redirect({ to: isAdmin ? "/admin" : "/dashboard" });
    } catch (err) {
      // Re-throw router redirects, fall through on real errors so the component renders.
      if (err && typeof err === "object" && "isRedirect" in err) throw err;
      throw redirect({ to: "/auth" });
    }
  },
  pendingComponent: Splash,
  component: Splash,
  errorComponent: ErrorSplash,
});

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}

function ErrorSplash({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground break-words">{error?.message ?? "Unknown error"}</p>
        <a href="/auth" className="inline-block rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">Go to sign in</a>
      </div>
    </div>
  );
}
