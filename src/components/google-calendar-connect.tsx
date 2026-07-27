import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarCheck, Calendar as CalendarIcon } from "lucide-react";
import {
  getMyGoogleCalendarStatus,
  startGoogleCalendarConnect,
  disconnectGoogleCalendar,
} from "@/lib/googleCalendar.functions";

function waitForOAuthCompletion(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "google_calendar" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") return resolve();
      popup.close();
      reject(new Error("Google Calendar connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("OAuth window closed before completion."));
    }, 500);
  });
}

export function GoogleCalendarConnectCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => getMyGoogleCalendarStatus(),
  });

  const connect = useMutation({
    mutationFn: async () => {
      const popup = window.open("", "lovable-gcal-oauth", "width=600,height=720");
      if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
      try {
        const { authorizationUrl } = await startGoogleCalendarConnect();
        const completion = waitForOAuthCompletion(popup);
        popup.location.href = authorizationUrl;
        await completion;
      } catch (e) {
        popup.close();
        throw e;
      }
    },
    onSuccess: () => {
      toast.success("Google Calendar connected");
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
      qc.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectGoogleCalendar(),
    onSuccess: () => {
      toast.success("Google Calendar disconnected");
      qc.invalidateQueries({ queryKey: ["gcal-status"] });
      qc.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connected = !!data?.connected;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        {connected ? (
          <CalendarCheck className="h-5 w-5 text-success mt-0.5" />
        ) : (
          <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
        )}
        <div className="flex-1">
          <h3 className="font-display font-semibold">Google Calendar</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Google Calendar so booking times automatically hide slots
            when you're busy. We only read free/busy — event details stay private.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {isLoading ? (
          <Button disabled variant="outline">Loading…</Button>
        ) : connected ? (
          <>
            <Button variant="outline" disabled className="gap-2">
              <CalendarCheck className="h-4 w-4" /> Connected
            </Button>
            <Button
              variant="ghost"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button onClick={() => connect.mutate()} disabled={connect.isPending} className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            {connect.isPending ? "Connecting…" : "Connect Google Calendar"}
          </Button>
        )}
      </div>
    </Card>
  );
}
