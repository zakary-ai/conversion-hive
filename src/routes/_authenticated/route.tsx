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
            className="border-b border-border bg-card fixed md:sticky top-0 left-0 right-0 md:left-auto md:right-auto z-40"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
          >
            {/* Mobile: centered title */}
            <div className="md:hidden h-12 flex items-end justify-center pb-2 px-4">
              <div className="font-display font-semibold tracking-tight text-base">
                Conversion Lab
              </div>
            </div>
            {/* Desktop: original layout */}
            <div className="hidden md:flex h-14 items-center justify-between gap-3 px-4">
              <div className="flex items-center gap-3 min-w-0">
                <SidebarTrigger />
                <div className="text-sm text-muted-foreground truncate">
                  {me.isAdmin ? "Admin workspace" : "Client workspace"}
                </div>
              </div>
              <div className="text-right min-w-0">
                <div className="text-sm font-medium truncate max-w-[180px]">{me.profile?.full_name || me.profile?.email || "User"}</div>
                <div className="text-xs text-muted-foreground">{me.isAdmin ? "Admin" : "Client"}</div>
              </div>
            </div>
          </header>
          <main
            className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden"
            style={{
              paddingTop: "calc(env(safe-area-inset-top) + 4rem)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 5.5rem)",
            }}
          >
            <Outlet />
          </main>

        </div>
        <BottomNav isAdmin={me.isAdmin} />
      </div>
    </SidebarProvider>
  );
}
