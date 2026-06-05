import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Platform configuration." />
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
