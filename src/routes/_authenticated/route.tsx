import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/api/cl.functions";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async () => getMe(),
});

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    await context.queryClient.ensureQueryData(meQueryOptions);
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions);


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <div className="hidden md:block">
          <AppSidebar isAdmin={me.isAdmin} />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/60 backdrop-blur sticky top-0 z-40"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden md:block"><SidebarTrigger /></div>
              <div className="md:hidden font-display font-semibold tracking-tight truncate">
                Conversion Lab
              </div>
              <div className="text-sm text-muted-foreground hidden sm:block">
                {me.isAdmin ? "Admin workspace" : "Client workspace"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium">{me.profile?.full_name || me.profile?.email || "User"}</div>
                <div className="text-xs text-muted-foreground">{me.isAdmin ? "Admin" : "Client"}</div>
              </div>
            </div>
          </header>
          <main
            className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden pb-24 md:pb-8"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6rem)" }}
          >
            <Outlet />
          </main>
        </div>
        <BottomNav isAdmin={me.isAdmin} />
      </div>
    </SidebarProvider>
  );
}
