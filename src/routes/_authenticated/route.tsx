import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/api/cl.functions";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import logo from "@/assets/logo.png";
import { NotificationsBell } from "@/components/notifications-bell";

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
      <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-background md:min-h-screen">
        <div className="hidden md:block">
          <AppSidebar isAdmin={me.isAdmin} isCloser={me.isCloser} />
        </div>
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card">
            {/* Mobile: centered title */}
            <div className="flex h-10 items-center justify-between gap-2 px-4 md:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <img src={logo} alt="" width={22} height={22} className="h-5.5 w-5.5 rounded-md" />
                <div className="font-display font-semibold tracking-tight text-sm truncate">
                  Conversion Lab
                </div>
              </div>
              <NotificationsBell />
            </div>
            {/* Desktop: original layout */}
            <div className="hidden md:flex h-14 items-center justify-between gap-3 px-4">
              <div className="flex items-center gap-3 min-w-0">
                <SidebarTrigger />
                <div className="text-sm text-muted-foreground truncate">
                  {me.isAdmin ? "Admin workspace" : "Client workspace"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <NotificationsBell />
                <div className="text-right min-w-0">
                  <div className="text-sm font-medium truncate max-w-[180px]">{me.profile?.full_name || me.profile?.email || "User"}</div>
                  <div className="text-xs text-muted-foreground">{me.isAdmin ? "Admin" : "Client"}</div>
                </div>
              </div>
            </div>
          </header>
          <main
            className="mobile-app-scroll flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:p-6 sm:pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-6 lg:p-8"
          >
            <Outlet />
          </main>

        </div>
        <BottomNav isAdmin={me.isAdmin} isCloser={me.isCloser} />
      </div>
    </SidebarProvider>
  );
}
