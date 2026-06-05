import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { listMyAppointments, listAllAppointments, deleteAppointment, getMe } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, CheckCircle2, Phone, Mail, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const meOpts = queryOptions({ queryKey: ["me"], queryFn: () => getMe() });
const myOpts = queryOptions({ queryKey: ["my-appointments"], queryFn: () => listMyAppointments() });
const allOpts = queryOptions({ queryKey: ["all-appointments"], queryFn: () => listAllAppointments() });

type Appt = Awaited<ReturnType<typeof listMyAppointments>>[number];

export const Route = createFileRoute("/_authenticated/calendar")({
  loader: ({ context }) => context.queryClient.ensureQueryData(meOpts),
  component: CalendarPage,
});

function CalendarPage() {
  const { data: me } = useSuspenseQuery(meOpts);
  const [tab, setTab] = useState<string>(me.isAdmin ? "all" : "mine");
  const [filter, setFilter] = useState<"all" | "booking" | "callback">("all");
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader title="Calendar" description="Booked appointments and scheduled callbacks." />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="mine">My calendar</TabsTrigger>
            {me.isAdmin && <TabsTrigger value="all">All setters</TabsTrigger>}
          </TabsList>
          <div className="flex gap-1">
            {(["all","booking","callback"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "booking" ? "Bookings" : "Callbacks"}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="mine" className="mt-4">
          <ApptView queryOpts={myOpts} filter={filter} date={date} setDate={setDate} canDelete />
        </TabsContent>
        {me.isAdmin && (
          <TabsContent value="all" className="mt-4">
            <ApptView queryOpts={allOpts} filter={filter} date={date} setDate={setDate} canDelete={false} showOwner />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ApptView({
  queryOpts, filter, date, setDate, canDelete, showOwner,
}: {
  queryOpts: typeof myOpts; filter: "all"|"booking"|"callback";
  date: Date | undefined; setDate: (d: Date | undefined) => void;
  canDelete: boolean; showOwner?: boolean;
}) {
  const { data: appts } = useSuspenseQuery(queryOpts);
  const filtered = useMemo(
    () => appts.filter((a) => filter === "all" || a.type === filter),
    [appts, filter]
  );

  const daysWithAppts = useMemo(() => {
    const s = new Set<string>();
    filtered.forEach((a) => s.add(new Date(a.scheduled_at).toDateString()));
    return s;
  }, [filtered]);

  const selectedDayAppts = useMemo(() => {
    if (!date) return filtered;
    const key = date.toDateString();
    return filtered.filter((a) => new Date(a.scheduled_at).toDateString() === key);
  }, [filtered, date]);

  const upcoming = useMemo(
    () => filtered.filter((a) => new Date(a.scheduled_at) >= new Date(Date.now() - 60 * 60 * 1000)).slice(0, 50),
    [filtered]
  );

  return (
    <div className="grid lg:grid-cols-[auto,1fr] gap-6">
      <Card className="p-3 w-fit">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          modifiers={{ hasAppt: (d) => daysWithAppts.has(d.toDateString()) }}
          modifiersClassNames={{ hasAppt: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary" }}
          className="pointer-events-auto"
        />
      </Card>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-2">
            {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "All days"}
            <span className="ml-2 text-xs text-muted-foreground">({selectedDayAppts.length})</span>
          </h3>
          <ApptList items={selectedDayAppts} canDelete={canDelete} showOwner={showOwner} empty="No appointments this day." />
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2 text-muted-foreground">Upcoming</h3>
          <ApptList items={upcoming} canDelete={canDelete} showOwner={showOwner} empty="Nothing scheduled." />
        </div>
      </div>
    </div>
  );
}

function ApptList({ items, canDelete, showOwner, empty }: { items: Appt[]; canDelete: boolean; showOwner?: boolean; empty: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => deleteAppointment({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
    },
  });

  if (items.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground text-center">{empty}</Card>;
  }
  return (
    <div className="space-y-2">
      {items.map((a) => {
        const dt = new Date(a.scheduled_at);
        const isBooking = a.type === "booking";
        return (
          <Card key={a.id} className="p-3 flex items-start gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
              isBooking ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
            )}>
              {isBooking ? <CheckCircle2 className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {a.phone && (
                  <a href={`tel:${a.phone}`} className="flex items-center gap-1 text-primary">
                    <Phone className="h-3 w-3" />{a.phone}
                  </a>
                )}
                {a.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{a.email}</span>}
                {showOwner && <span className="flex items-center gap-1"><User className="h-3 w-3" />setter</span>}
                <span className="uppercase tracking-wider">{a.type}</span>
              </div>
              {a.context && <div className="text-xs mt-1">{a.context}</div>}
            </div>
            {canDelete && (
              <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
