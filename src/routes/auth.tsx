import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy redirect — older invites/emails link to /auth.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/app/auth" });
  },
});
