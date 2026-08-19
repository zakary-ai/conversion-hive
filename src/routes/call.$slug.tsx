import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPublicManagerBySlug, listPublicManagerSlots, bookPublicManagerSlot } from "@/lib/api/dm-manager.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/call/$slug")({
  loader: async ({ params }) => {
    const manager = await getPublicManagerBySlug({ data: { slug: params.slug } });
    if (!manager) throw notFound();
    return manager;
  },
  head: ({ loaderData }) => {
    const who = loaderData?.managerName ?? "Conversion Lab";
    return {
      meta: [
        { title: `1-on-1 call with ${who} · Conversion Lab` },
        { name: "description", content: `Pick a time for a 30-minute 1-on-1 call with ${who}.` },
        { property: "og:title", content: `1-on-1 call with ${who}` },
        { property: "og:description", content: `Choose a time for a 30-minute 1-on-1 call with ${who}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <Shell><p className="text-sm text-muted-foreground">Something went wrong loading this page. Please refresh and try again.</p></Shell>
  ),
  notFoundComponent: () => (
    <Shell><p className="text-sm text-muted-foreground">This booking link isn't active anymore.</p></Shell>
  ),
  component: ManagerBookingPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh w-full overflow-y-auto bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">{children}</div>
    </main>
  );
}

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function ManagerBookingPage() {
  const { slug, managerName } = Route.useLoaderData();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [day, setDay] = useState<Date | undefined>(new Date());
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [done, setDone] = useState<{ label: string } | null>(null);

  const date = day ? keyOf(day) : keyOf(new Date());
  const slots = useQuery({
    queryKey: ["public-manager-slots", slug, date],
    queryFn: () => listPublicManagerSlots({ data: { slug, date } }),
  });

  const book = useMutation({
    mutationFn: () =>
      bookPublicManagerSlot({
        data: {
          slug,
          scheduled_at: slot!,
          timezone: tz,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
        },
      }),
    onSuccess: (res) => setDone({ label: res.scheduled_label }),
  });

  if (done) {
    return (
      <Shell>
        <Card className="mx-auto max-w-md p-8 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">You're booked</h1>
          <p className="text-sm text-muted-foreground">{done.label}</p>
          <p className="text-sm text-muted-foreground">
            An invite with the meeting link is on its way to {form.email}.
          </p>
        </Card>
      </Shell>
    );
  }

  const canBook = !!slot && form.name.trim().length > 1 && /\S+@\S+\.\S+/.test(form.email.trim());
  const dayLabel = day ? day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";

  return (
    <Shell>
      <div>
        <h1 className="text-2xl font-semibold">1-on-1 call with {managerName ?? "Conversion Lab"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a 30-minute time that works for you. Times shown in your timezone ({tz}).
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex justify-center border-b p-3 md:border-b-0 md:border-r">
            <Calendar
              mode="single"
              selected={day}
              onSelect={(d: Date | undefined) => { setDay(d ?? undefined); setSlot(null); }}
              disabled={{ before: today }}
              className="[--cell-size:2.4rem]"
            />
          </div>
          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="h-4 w-4 text-primary" />
              {dayLabel || "Pick a day"}
            </div>
            {!day ? (
              <p className="py-6 text-sm text-muted-foreground">Select a date to see available times.</p>
            ) : slots.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading times…
              </div>
            ) : (slots.data ?? []).length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No times left on this day — try another date.</p>
            ) : (
              <div className="mt-3 grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {(slots.data ?? []).map((iso) => (
                  <Button
                    key={iso}
                    type="button"
                    size="sm"
                    variant={slot === iso ? "default" : "outline"}
                    onClick={() => setSlot(iso)}
                  >
                    {new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {slot && (
        <Card className="p-5 space-y-3">
          <p className="text-sm font-medium">
            Your details ·{" "}
            <span className="text-muted-foreground">
              {dayLabel} at {new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          </p>
          <div>
            <Label>Full name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone number</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          {book.isError && <p className="text-sm text-destructive">{(book.error as Error).message}</p>}

          <Button className="w-full" disabled={!canBook || book.isPending} onClick={() => book.mutate()}>
            {book.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </Card>
      )}
    </Shell>
  );
}
