import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    // Check role
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.session.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    throw redirect({ to: isAdmin ? "/admin" : "/dashboard" });
  },
  component: () => null,
});
