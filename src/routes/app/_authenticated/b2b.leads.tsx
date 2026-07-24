import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyClaimedLeads } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogCallOutcomeDialog } from "@/components/log-call-outcome-dialog";
import { ExternalLink, Phone, Mail, Building2, Linkedin, MapPin, PhoneCall } from "lucide-react";

const opts = queryOptions({
  queryKey: ["my-claimed-leads"],
  queryFn: () => listMyClaimedLeads(),
});

export const Route = createFileRoute("/app/_authenticated/b2b/leads")({
  head: () => ({ meta: [{ title: "My Leads" }, { name: "description", content: "Leads you've claimed from the pool." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: MyLeadsPage,
});

function MyLeadsPage() {
  const { data: leads } = useSuspenseQuery(opts);
  const [preview, setPreview] = useState<any | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="My leads" description={`${leads.length} claimed`} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Email</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr
                key={l.id}
                className="border-t border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => setPreview(l)}
              >
                <td className="p-3 font-medium">
                  {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="p-3">{l.company || "—"}</td>
                <td className="p-3">{l.phone || "—"}</td>
                <td className="p-3">{l.email || "—"}</td>
                <td className="p-3"><Badge variant={l.status === "booked" ? "default" : "secondary"}>{l.status}</Badge></td>
              </tr>
            ))}
            {!leads.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                No claimed leads yet. Head to <Link to="/app/b2b/pool" className="underline">Lead Pool</Link> to claim some.
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <LeadPreviewDialog
        lead={preview}
        onClose={() => setPreview(null)}
        onLogOutcome={() => setLogOpen(true)}
      />

      {preview && (
        <LogCallOutcomeDialog
          lead={{ id: preview.id, first_name: preview.first_name, last_name: preview.last_name }}
          open={logOpen}
          onClose={() => setLogOpen(false)}
          onLogged={() => { setLogOpen(false); setPreview(null); }}
        />
      )}
    </div>
  );
}

function LeadPreviewDialog({ lead, onClose, onLogOutcome }: {
  lead: any | null; onClose: () => void; onLogOutcome: () => void;
}) {
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle>{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <Field icon={<Building2 className="h-4 w-4" />} label="Company" value={lead.company} />
              <Field label="Title" value={lead.title} />
              <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={lead.phone} />
              <Field icon={<Mail className="h-4 w-4" />} label="Email" value={lead.email} />
              <Field
                label="Website"
                value={lead.website}
                render={(v) => <a onClick={(e) => e.stopPropagation()} href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{v} <ExternalLink className="h-3 w-3" /></a>}
              />
              <Field
                icon={<Linkedin className="h-4 w-4" />}
                label="LinkedIn"
                value={lead.linkedin_url}
                render={(v) => <a onClick={(e) => e.stopPropagation()} href={/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Open profile <ExternalLink className="h-3 w-3" /></a>}
              />
              <Field icon={<MapPin className="h-4 w-4" />} label="Location" value={[lead.city, lead.state].filter(Boolean).join(", ") || null} />
              <Field label="Industry" value={lead.industry} />
              <Field label="Segment" value={lead.segment} />
              <Field label="Lead type" value={lead.lead_type} />
              <Field label="Company size" value={lead.company_size} />
              <Field label="Email status" value={lead.email_status} />
              {lead.notes && <div className="sm:col-span-2"><Field label="Notes" value={lead.notes} /></div>}
            </div>
            <div className="flex justify-end gap-2 pt-2 flex-wrap">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="outline" asChild disabled={!lead.phone}>
                <a href={lead.phone ? `tel:${lead.phone}` : undefined}>
                  <PhoneCall className="h-4 w-4 mr-1" /> Call
                </a>
              </Button>
              <Button onClick={onLogOutcome}>Log call outcome</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, icon, render }: {
  label: string; value: string | null | undefined; icon?: React.ReactNode; render?: (v: string) => React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="mt-1 text-sm break-words">{value ? (render ? render(value) : value) : <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
