import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { listMyAppointments, listAllAppointments, cancelAppointment, getMe } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { CalendarClock, CheckCircle2, Phone, Mail, MoreVertical, CalendarDays, XCircle, User, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { B2bCalendarPanel } from "@/components/admin/b2b-calendar-panel";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { EditLeadDialog } from "@/components/edit-lead-dialog";


const meOpts = queryOptions({ queryKey: ["me"], queryFn: () => getMe() });
const myOpts = queryOptions({ queryKey: ["my-appointments"], queryFn: () => listMyAppointments() });
const allOpts = queryOptions({ queryKey: ["all-appointments"], queryFn: () => listAllAppointments() });

type Appt = Awaited<ReturnType<typeof listMyAppointments>>[number];

export const Route = createFileRoute("/app/_authenticated/calendar")({
  loader: ({ context }) => context.queryClient.ensureQueryData(meOpts),
  component: CalendarPage,
});

function CalendarPage() {
  const { data: me } = useSuspenseQuery(meOpts);
  const [tab, setTab] = useState<string>(me.isAdmin ? "availability" : "mine");
  const [filter, setFilter] = useState<"all" | "booking" | "callback">("all");
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="max-w-7xl space-y-3 md:space-y-6">
      <h1 className="sr-only md:hidden">Calendar</h1>
      <div className="hidden md:block">
        <PageHeader title="Calendar" description="Booked appointments and scheduled callbacks." />
      </div>


      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            {me.isAdmin && <TabsTrigger value="availability">Availability</TabsTrigger>}
            {!me.isAdmin && <TabsTrigger value="mine">My calendar</TabsTrigger>}
            {me.isAdmin && <TabsTrigger value="all">Calendar</TabsTrigger>}
            {!me.isAdmin && <TabsTrigger value="history">History</TabsTrigger>}
          </TabsList>
          {tab !== "availability" && (
            <div className="flex gap-1">
              {(["all","booking","callback"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "booking" ? "Bookings" : "Callbacks"}
                </Button>
              ))}
            </div>
          )}
        </div>

        {me.isAdmin && (
          <TabsContent value="availability" className="mt-4">
            <B2bCalendarPanel />
          </TabsContent>
        )}
        {!me.isAdmin && (
          <TabsContent value="mine" className="mt-4">
            <ApptView queryOpts={myOpts} filter={filter} date={date} setDate={setDate} canDelete mode="upcoming" />
          </TabsContent>
        )}
        {me.isAdmin && (
          <TabsContent value="all" className="mt-4">
            <ApptView queryOpts={allOpts} filter={filter} date={date} setDate={setDate} canDelete={false} showOwner mode="all" />
          </TabsContent>
        )}
        {!me.isAdmin && (
          <TabsContent value="history" className="mt-4">
            <ApptView queryOpts={myOpts} filter={filter} date={date} setDate={setDate} canDelete mode="past" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ApptView({
  queryOpts, filter, date, setDate, canDelete, showOwner, mode,
}: {
  queryOpts: typeof myOpts; filter: "all"|"booking"|"callback";
  date: Date | undefined; setDate: (d: Date | undefined) => void;
  canDelete: boolean; showOwner?: boolean;
  mode: "upcoming" | "past" | "all";
}) {
  const { data: apptsRaw } = useSuspenseQuery(queryOpts);
  const appts = apptsRaw as Appt[];
  const cutoff = Date.now() - 60 * 60 * 1000;
  const scoped = useMemo(() => {
    if (mode === "all") return appts;
    return appts.filter((a) => {
      const t = new Date(a.scheduled_at).getTime();
      return mode === "past" ? t < cutoff : t >= cutoff;
    });
  }, [appts, mode, cutoff]);

  const filtered = useMemo(
    () => scoped.filter((a) => filter === "all" || a.type === filter),
    [scoped, filter]
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

  const secondary = useMemo(() => {
    if (mode === "past") {
      return [...filtered].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()).slice(0, 50);
    }
    if (mode === "all") {
      return [...filtered].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()).slice(0, 50);
    }
    return filtered.slice(0, 50);
  }, [filtered, mode]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[auto,1fr] lg:gap-6">
      <Card className="flex w-full justify-center overflow-hidden p-2 sm:p-3 lg:w-fit">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          modifiers={{ hasAppt: (d) => daysWithAppts.has(d.toDateString()) }}
          modifiersClassNames={{ hasAppt: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary" }}
          className="pointer-events-auto mx-auto"
        />
      </Card>

      <div className="min-w-0 space-y-3 lg:space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-2">
            {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "All days"}
            <span className="ml-2 text-xs text-muted-foreground">({selectedDayAppts.length})</span>
          </h3>
          <ApptList items={selectedDayAppts} canDelete={canDelete} showOwner={showOwner} empty={mode === "past" ? "No past appointments this day." : "No appointments this day."} compactScroll />
        </div>
        <div className="hidden lg:block">
          <h3 className="text-sm font-medium mb-2 text-muted-foreground">{mode === "past" ? "Recent history" : mode === "all" ? "All appointments" : "Upcoming"}</h3>
          <ApptList items={secondary} canDelete={canDelete} showOwner={showOwner} empty={mode === "past" ? "No history yet." : mode === "all" ? "Nothing here yet." : "Nothing scheduled."} />
        </div>
      </div>
    </div>
  );
}

function ApptList({ items, canDelete, showOwner, empty, compactScroll }: { items: Appt[]; canDelete: boolean; showOwner?: boolean; empty: string; compactScroll?: boolean }) {
  const qc = useQueryClient();
  const [openAppt, setOpenAppt] = useState<Appt | null>(null);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appt | null>(null);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment({ data: { id } }),
    onSuccess: () => {
      toast.success("Cancelled — lead marked Not Interested");
      qc.invalidateQueries({ queryKey: ["my-appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground text-center">{empty}</Card>;
  }
  return (
    <>
      <div className={cn("min-w-0 space-y-2 overflow-hidden", compactScroll && "max-h-40 overflow-y-auto pr-1 md:max-h-none md:overflow-hidden md:pr-0")}>
        {items.map((a) => {
          const dt = new Date(a.scheduled_at);
          const isBooking = a.type === "booking";
          const outcomeBadge =
            a.outcome === "closed" ? { label: `Closed${a.deal_amount != null ? ` · $${Number(a.deal_amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : ""}`, cls: "bg-success/15 text-success" } :
            a.outcome === "lost" ? { label: "Lost", cls: "bg-destructive/15 text-destructive" } :
            a.outcome === "no_show" ? { label: "No show", cls: "bg-warning/15 text-warning" } :
            null;
          return (
            <Card
              key={a.id}
              className="flex min-w-0 cursor-pointer items-start gap-2 overflow-hidden p-2.5 transition-colors hover:bg-muted/30 sm:gap-3 sm:p-3"
              onClick={() => setOpenAppt(a)}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10",
                isBooking ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
              )}>
                {isBooking ? <CheckCircle2 className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="max-w-full truncate font-medium leading-tight">{a.name}</div>
                    {outcomeBadge && (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider", outcomeBadge.cls)}>
                        {outcomeBadge.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {a.phone && (
                    <a href={`tel:${a.phone}`} onClick={(e) => e.stopPropagation()} className="flex max-w-full min-w-0 items-center gap-1 text-primary">
                      <Phone className="h-3 w-3 shrink-0" /><span className="truncate">{a.phone}</span>
                    </a>
                  )}
                  {a.email && <span className="flex max-w-full min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{a.email}</span></span>}
                  {showOwner && <span className="flex items-center gap-1"><User className="h-3 w-3 shrink-0" />setter</span>}
                  <span className="uppercase tracking-wider">{a.type}</span>
                </div>
                {a.context && <div className="mt-1 break-words text-xs">{a.context}</div>}
                {a.meeting_url && (
                  <a
                    href={a.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Join meeting
                  </a>
                )}
              </div>
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => setRescheduleAppt(a)}>
                      <CalendarDays className="mr-2 h-4 w-4" /> Reschedule
                    </DropdownMenuItem>
                    {a.lead_id && (
                      <DropdownMenuItem onClick={() => setEditLeadId(a.lead_id)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit lead
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm("Cancel this appointment? The lead will be moved to Not Interested.")) {
                          cancel.mutate(a.id);
                        }
                      }}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Cancel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Card>
          );
        })}
      </div>
      <AppointmentDetailDialog appt={openAppt} onClose={() => setOpenAppt(null)} />
      <RescheduleDialog
        apptId={rescheduleAppt?.id ?? null}
        currentScheduledAt={rescheduleAppt?.scheduled_at}
        onClose={() => setRescheduleAppt(null)}
      />
      <EditLeadDialog leadId={editLeadId} onClose={() => setEditLeadId(null)} />
    </>
  );
}
