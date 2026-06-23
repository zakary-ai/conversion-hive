import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { backfillOpenphoneArtifacts } from "@/lib/api/calls.functions";

export const Route = createFileRoute("/app/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const backfill = useServerFn(backfillOpenphoneArtifacts);
  const [running, setRunning] = useState(false);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/app/auth", replace: true });
  };

  const handleBackfill = async () => {
    setRunning(true);
    try {
      const res = await backfill();
      toast.success(
        `Backfill done: adopted ${res.adopted}, scanned ${res.scanned}, updated ${res.updated} (transcripts +${res.txFilled}, recordings +${res.recFilled}, summaries +${res.sumFilled})`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Platform configuration." />

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-2">Calling (Quo / OpenPhone)</h3>
        <p className="text-sm text-muted-foreground">
          Setters dial leads through the Quo app. Invite each new setter to your Quo workspace
          from the Quo dashboard (Settings → Members) so the Call button opens Quo on their device.
        </p>
        <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <h4 className="font-medium text-sm">Backfill past calls</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Pulls transcripts, recordings, and summaries from OpenPhone for every logged
              call that's missing them.
            </p>
          </div>
          <Button variant="outline" onClick={handleBackfill} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {running ? "Running…" : "Backfill now"}
          </Button>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-display font-semibold mb-2">Lead scraper</h3>
        <p className="text-sm text-muted-foreground">
          Each client is targeted for up to 75 active leads per day. The scraper integration
          will populate the leads table automatically once connected.
        </p>
      </Card>
      <Card className="p-6">
        <h3 className="font-display font-semibold mb-2">Roles</h3>
        <p className="text-sm text-muted-foreground">
          New signups default to the Client role. To promote a user to Admin, insert a row
          into the user_roles table via the backend.
        </p>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold">Sign out</h3>
            <p className="text-sm text-muted-foreground mt-1">End your session on this device.</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
