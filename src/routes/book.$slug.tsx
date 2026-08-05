import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPublicSetterBySlug, listPublicB2bSlots, bookPublicB2bSlot } from "@/lib/api/public-booking.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/book/$slug")({
  loader: async ({ params }) => {
    const setter = await getPublicSetterBySlug({ data: { slug: params.slug } });
    if (!setter) throw notFound();
    return setter;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Book an intro call · Conversion Lab" },
      {
        name: "description",
        content: `Pick a time for an intro call about advertising inside ChatGPT${loaderData?.setterName ? ` with ${loaderData.setterName}` : ""}.`,
      },
      { property: "og:title", content: "Book an intro call · Conversion Lab" },
      { property: "og:description", content: "Choose a time to talk through advertising inside ChatGPT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <Shell>
      <p className="text-sm text-muted-foreground">Something went wrong loading this page. Please refresh and try again.</p>
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <p className="text-sm text-muted-foreground">This booking link isn't active anymore.</p>
    </Shell>
  ),
  component: PublicBookingPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-xl space-y-6">{children}</div>
    </main>
  );
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function PublicBookingPage() {
  const { slug, setterName } = Route.useLoaderData();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [date, setDate] = useState(todayKey());
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", company: "", note: "" });
  const [done, setDone] = useState<{ label: string } | null>(null);

  const slots = useQuery({
    queryKey: ["public-b2b-slots", slug, date, tz],
    queryFn: () => listPublicB2bSlots({ data: { slug, date, tz } }),
  });

  const book = useMutation({
    mutationFn: () =>
      bookPublicB2bSlot({
        data: {
          slug,
          scheduled_at: slot!,
          timezone: tz,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          company: form.company.trim() || undefined,
          note: form.note.trim() || undefined,
        },
      }),
    onSuccess: (res) => setDone({ label: res.scheduled_label }),
  });

  if (done) {
    return (
      <Shell>
        <Card className="p-8 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">You're booked</h1>
          <p className="text-sm text-muted-foreground">{done.label}</p>
          <p className="text-sm text-muted-foreground">
            A confirmation with the meeting link is on its way to {form.email}.
          </p>
        </Card>
      </Shell>
    );
  }

  const canBook = !!slot && form.first_name.trim() && /\S+@\S+\.\S+/.test(form.email.trim());

  return (
    <Shell>
      <div>
        <h1 className="text-2xl font-semibold">Book an intro call</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A quick walkthrough of advertising inside ChatGPT and what a first campaign looks like for you
          {setterName ? ` — booked with ${setterName}'s team` : ""}. Times shown in your timezone ({tz}).
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <Label>Pick a day</Label>
          <Input type="date" value={date} min={todayKey()} onChange={(e) => { setDate(e.target.value); setSlot(null); }} />
        </div>

        <div>
          <Label className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Available times</Label>
          {slots.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading times…
            </div>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No times left on this day — try another date.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 mt-2">
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
      </Card>

      <Card className="p-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>First name</Label>
            <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Anything we should know? (optional)</Label>
          <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

        {book.isError && (
          <p className="text-sm text-destructive">{(book.error as Error).message}</p>
        )}

        <Button className="w-full" disabled={!canBook || book.isPending} onClick={() => book.mutate()}>
          {book.isPending ? "Booking…" : "Confirm booking"}
        </Button>
      </Card>
    </Shell>
  );
}
