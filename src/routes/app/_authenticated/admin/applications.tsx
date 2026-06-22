import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_authenticated/admin/applications")({
  beforeLoad: () => {
    throw redirect({ to: "/app/admin/bookings" });
  },
});
