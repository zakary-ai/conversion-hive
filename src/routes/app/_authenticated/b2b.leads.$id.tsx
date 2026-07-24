import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getPoolLead } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogCallOutcomeDialog } from "@/components/log-call-outcome-dialog";
import { ArrowLeft, ExternalLink, Phone, Mail, Building2, Linkedin } from "lucide-react";

const opts = (id: string) => queryOptions({
  queryKey: ["pool-lead", id],
  queryFn: () => getPoolLead({ data: { id } }),
});

export const Route = createFileRoute("/app/_authenticated/b2b/leads/$id")({
  head: ({ params }) => ({ meta: [{ title: "Lead" }, { name: "description", content: `Lead ${params.id}` }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.id)),
  component: LeadDetailPage,
});

const outcomeLabel: Record<string, string> = {
  booked: "Booked",
  callback_scheduled: "Callback scheduled",
  no_answer: "Didn't pick up",
  not_interested: "Not interested",
};

function LeadDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(opts(id));
  const { lead, attempts, callbacks } = data;
  const [logOpen, setLogOpen] = useState(false);
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-4 max-w-4xl">
      <Link to="/app/b2b/leads" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to my leads
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title={fullName} description={lead.company || "—"} />
        <div className="flex items-center gap-2">
          <Badge variant={lead.status === "booked" ? "default" : "secondary"}>{lead.status}</Badge>
          <Button onClick={() => setLogOpen(true)}>Log call outcome</Button>
        </div>
      </div>

      <Card className="p-5 grid gap-3 sm:grid-cols-2">
        <Field icon={<Building2 className="h-4 w-4" />} label="Company" value={lead.company} />
        <Field label="Title" value={lead.title} />
        <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={lead.phone} />
        <Field icon={<Mail className="h-4 w-4" />} label="Email" value={lead.email} />
        <Field
          label="Website"
          value={lead.website}
          render={(v) => <a href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{v} <ExternalLink className="h-3 w-3" /></a>}
        />
        <Field
          icon={<Linkedin className="h-4 w-4" />}
          label="LinkedIn"
          value={lead.linkedin_url}
          render={(v) => <a href={/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open profile <ExternalLink className="h-3 w-3" /></a>}
        />
        <Field label="Source" value={lead.source} />
        {lead.notes && <div className="sm:col-span-2"><Field label="Notes" value={lead.notes} /></div>}
      </Card>

      {callbacks.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Scheduled callbacks</h3>
          <ul className="space-y-2 text-sm">
            {callbacks.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <span>{new Date(c.scheduled_at).toLocaleString()}</span>
                <Badge variant="outline">{c.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Call history</h3>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outcomes logged yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {attempts.map((a) => (
              <li key={a.id} className="border-b border-border pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{outcomeLabel[a.outcome] ?? a.outcome}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(a.occurred_at).toLocaleString()}</span>
                </div>
                {a.note && <p className="mt-1 text-muted-foreground">{a.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <LogCallOutcomeDialog
        lead={{ id: lead.id, first_name: lead.first_name, last_name: lead.last_name }}
        open={logOpen}
        onClose={() => setLogOpen(false)}
      />
    </div>
  );
}

function Field({
  label, value, icon, render,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
  render?: (v: string) => React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 text-sm break-words">{value ? (render ? render(value) : value) : <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
