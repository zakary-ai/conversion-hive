import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminListManagerCalendars } from "@/lib/api/dm-manager.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { CalendarClock, Copy, Mail, Phone, Video } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/admin/manager-calendars")({
  component: AdminManagerCalendarsPage,
});

type Booking = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  scheduled_at: string;
  meeting_url: string | null;
  status: string;
};

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  link: string;
  bookings: Booking[];
};

function AdminManagerCalendarsPage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["admin-manager-calendars"],
    queryFn: () => adminListManagerCalendars(),
  });
  const rows = data as Row[];

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { toast.error("Copy failed"); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">Manager calendars</h1>
        <p className="text-sm text-muted-foreground">Every DM setter manager's 1-on-1 booking link and their calls.</p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <Card className="p-4 text-sm text-destructive">{(error as Error).message}</Card>}
      {!isLoading && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No managers yet.</Card>
      )}

      <Accordion type="multiple" className="space-y-2">
        {rows.map((m) => {
          const upcoming = m.bookings.filter((b) => new Date(b.scheduled_at).getTime() > Date.now() && b.status !== "cancelled");
          return (
            <Card key={m.id} className="px-4">
              <AccordionItem value={m.id} className="border-0">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 flex-wrap text-left">
                    <span className="font-medium">{m.full_name || m.email}</span>
                    <Badge variant="secondary">{m.bookings.length} calls</Badge>
                    <Badge variant="outline">{upcoming.length} upcoming</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="flex gap-2 items-center">
                    <Input readOnly value={m.link} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button size="icon" variant="outline" onClick={() => copy(m.link)} title="Copy link">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {m.bookings.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No bookings yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {m.bookings.map((b) => (
                        <div key={b.id} className="rounded-lg border border-border/60 p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{b.name}</span>
                            <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(b.scheduled_at).toLocaleString()}</span>
                            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {b.email}</span>
                            {b.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {b.phone}</span>}
                            {b.meeting_url && (
                              <a href={b.meeting_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                                <Video className="h-3 w-3" /> Join
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Card>
          );
        })}
      </Accordion>
    </div>
  );
}
