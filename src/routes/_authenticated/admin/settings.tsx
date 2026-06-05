import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
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
    </div>
  );
}
