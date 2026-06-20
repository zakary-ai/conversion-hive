import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCloserBookings, listClosers, assignCloserToBooking, unassignCloser, cancelCloserBooking } from "@/lib/api/b2c.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CalendarClock, Mail, Phone, Video, X } from "lucide-react";
import { ApplicationDetailDialog } from "@/components/application-detail-dialog";
import { ApplicationsPanel, appsOpts } from "@/components/admin/applications-panel";
import { B2cCalendarPanel } from "@/components/admin/b2c-calendar-panel";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(appsOpts),
  component: BookingsPage,
});

type Booking = {
  id: string;
  application_id: string | null;
  slot_start: string;
  slot_end: string;
  assigned_closer_id: string | null;
  status: string;
  zoom_join_url: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  closers?: { full_name: string; email: string } | null;
};

function BookingsPage() {
  const { data } = useQuery({ queryKey: ["closer-bookings"], queryFn: () => listCloserBookings() });
  const { data: closers = [] } = useQuery({ queryKey: ["closers"], queryFn: () => listClosers() });
  const rows = (data?.rows ?? []) as Booking[];

  const pending = rows.filter((r) => r.status === "pending_assignment");
  const assigned = rows.filter((r) => r.status === "assigned");
  const past = rows.filter((r) => !["pending_assignment", "assigned"].includes(r.status));

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-display font-semibold">B2C Inbox</h1>
        <p className="text-sm text-muted-foreground">Bookings and applications in one place.</p>
      </div>

      <Tabs defaultValue="bookings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-6">
          <Section title="Pending assignment" count={pending.length}>
            {pending.length === 0 ? <Empty>No bookings waiting.</Empty> : pending.map((b) => (
              <BookingCard key={b.id} booking={b} closers={closers} />
            ))}
          </Section>

          <Section title="Assigned" count={assigned.length}>
            {assigned.length === 0 ? <Empty>No assigned bookings.</Empty> : assigned.map((b) => (
              <BookingCard key={b.id} booking={b} closers={closers} />
            ))}
          </Section>

          <Section title="History" count={past.length}>
            {past.length === 0 ? <Empty>Nothing here yet.</Empty> : past.map((b) => (
              <BookingCard key={b.id} booking={b} closers={closers} />
            ))}
          </Section>
        </TabsContent>

        <TabsContent value="applications">
          <ApplicationsPanel />
        </TabsContent>

        <TabsContent value="calendar">
          <B2cCalendarPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground">{title}</h2>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <Card className="p-6 text-sm text-muted-foreground text-center">{children}</Card>;
}

type CloserOpt = { id: string; full_name: string; active: boolean };

function BookingCard({ booking, closers }: { booking: Booking; closers: CloserOpt[] }) {
  const qc = useQueryClient();
  const assign = useMutation({
    mutationFn: (closer_id: string) => assignCloserToBooking({ data: { booking_id: booking.id, closer_id } }),
    onSuccess: () => { toast.success("Closer assigned"); qc.invalidateQueries({ queryKey: ["closer-bookings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const unassign = useMutation({
    mutationFn: () => unassignCloser({ data: { booking_id: booking.id } }),
    onSuccess: () => { toast.success("Unassigned"); qc.invalidateQueries({ queryKey: ["closer-bookings"] }); },
  });
  const cancel = useMutation({
    mutationFn: () => cancelCloserBooking({ data: { booking_id: booking.id } }),
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["closer-bookings"] }); },
  });

  const [openAppId, setOpenAppId] = useState<string | null>(null);

  const dt = new Date(booking.slot_start);
  const label = dt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {booking.application_id ? (
            <button
              type="button"
              onClick={() => setOpenAppId(booking.application_id)}
              className="font-medium text-left hover:underline text-primary"
            >
              {booking.applicant_name}
            </button>
          ) : (
            <div className="font-medium">{booking.applicant_name}</div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {label}</span>
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {booking.applicant_email}</span>
            {booking.applicant_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {booking.applicant_phone}</span>}
          </div>
          {booking.closers && (
            <div className="text-xs text-muted-foreground mt-1">Closer: <span className="text-foreground">{booking.closers.full_name}</span></div>
          )}
          {booking.zoom_join_url && (
            <a href={booking.zoom_join_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
              <Video className="h-3 w-3" /> Join Zoom
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {booking.status === "pending_assignment" && (
            <Select onValueChange={(id) => assign.mutate(id)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Assign closer…" /></SelectTrigger>
              <SelectContent>
                {closers.filter((c) => c.active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
                {closers.filter((c) => c.active).length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No active closers</div>
                )}
              </SelectContent>
            </Select>
          )}
          {booking.status === "assigned" && (
            <Button size="sm" variant="outline" onClick={() => unassign.mutate()}>Reassign</Button>
          )}
          {(booking.status === "pending_assignment" || booking.status === "assigned") && (
            <Button size="icon" variant="ghost" onClick={() => cancel.mutate()}><X className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
      <ApplicationDetailDialog
        applicationId={openAppId}
        open={!!openAppId}
        onOpenChange={(v) => !v && setOpenAppId(null)}
      />
    </Card>
  );
}
