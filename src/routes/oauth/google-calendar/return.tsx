import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeGoogleCalendarConnect } from "@/lib/googleCalendar.functions";

export const Route = createFileRoute("/oauth/google-calendar/return")({
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing Google Calendar connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed") => {
      window.opener?.postMessage(
        { type, connectorId: "google_calendar" },
        window.location.origin,
      );
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Google Calendar connection did not complete.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Connection completed without an exchange code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    void completeGoogleCalendarConnect({ data: { code } })
      .then(() => notify("appUserConnectorOAuthComplete"))
      .catch((e) => {
        setMessage(e instanceof Error ? e.message : "Could not finish the connection.");
        notify("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
