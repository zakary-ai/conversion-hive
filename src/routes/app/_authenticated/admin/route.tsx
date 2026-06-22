import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meQueryOptions } from "../route";
import { LeadRequestNotifier } from "@/components/lead-request-notifier";

export const Route = createFileRoute("/app/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.isAdmin) throw redirect({ to: "/app/dashboard" });
  },
  component: () => (
    <>
      <Outlet />
      <LeadRequestNotifier />
    </>
  ),
});
