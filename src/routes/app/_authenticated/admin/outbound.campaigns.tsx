import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { obListCampaigns, obCreateCampaign, obSyncCampaignToSmartlead, obAddLeadsToCampaign, obListSetters, obListLeads } from "@/lib/api/ob.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, RefreshCw, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { OutboundTabs } from "@/components/outbound-tabs";

const campaignsOpts = queryOptions({ queryKey: ["ob-campaigns"], queryFn: () => obListCampaigns() });
const settersOpts = queryOptions({ queryKey: ["ob-setters"], queryFn: () => obListSetters() });

export const Route = createFileRoute("/app/_authenticated/admin/outbound/campaigns")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(campaignsOpts),
    context.queryClient.ensureQueryData(settersOpts),
  ]),
  component: OutboundCampaignsPage,
});

function OutboundCampaignsPage() {
  const qc = useQueryClient();
  const { data: campaigns } = useSuspenseQuery(campaignsOpts);
  const { data: setters } = useSuspenseQuery(settersOpts);
  const [open, setOpen] = useState(false);
  const [addLeadsFor, setAddLeadsFor] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ob-campaigns"] });

  const sync = useMutation({
    mutationFn: (campaignId: string) => obSyncCampaignToSmartlead({ data: { campaignId } }),
    onSuccess: (r) => {
      toast.success(`Pushed ${r.pushed}, failed ${r.failed}`);
      if (r.errors.length) toast.error(r.errors[0]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <OutboundTabs />
      <PageHeader title="Campaigns" description={`${campaigns.length} total`} action={
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New campaign</Button>
      } />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Channel</th>
              <th className="text-left p-3">Setter</th>
              <th className="text-left p-3">Smartlead ID</th>
              <th className="text-left p-3">Members</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No campaigns yet.</td></tr>}
            {campaigns.map((c: any) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 uppercase text-xs">{c.channel}</td>
                <td className="p-3 text-muted-foreground">{setters.find((s) => s.user_id === c.setter_id)?.name ?? "—"}</td>
                <td className="p-3 text-xs">{c.smartlead_campaign_id ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3 text-xs">
                  <span>{c.total} total</span>
                  {c.pending > 0 && <span className="ml-2 rounded-md bg-amber-500/20 px-1.5 py-0.5">{c.pending} pending</span>}
                  {c.active > 0 && <span className="ml-2 rounded-md bg-emerald-500/20 px-1.5 py-0.5">{c.active} active</span>}
                </td>
                <td className="p-3 text-xs uppercase">{c.status}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => setAddLeadsFor(c.id)}><Upload className="h-3 w-3 mr-1" />Add leads</Button>
                  <Button size="sm" className="ml-2" disabled={!c.smartlead_campaign_id || sync.isPending} onClick={() => sync.mutate(c.id)}>
                    {sync.isPending && sync.variables === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Sync to Smartlead
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <CreateDialog open={open} onOpenChange={setOpen} setters={setters} onDone={invalidate} />
      <AddLeadsDialog campaignId={addLeadsFor} onClose={() => setAddLeadsFor(null)} onDone={invalidate} />
    </div>
  );
}

function CreateDialog({ open, onOpenChange, setters, onDone }: any) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"email"|"linkedin"|"call">("email");
  const [setterId, setSetterId] = useState<string>("");
  const [smartleadId, setSmartleadId] = useState("");

  const m = useMutation({
    mutationFn: () => obCreateCampaign({ data: { name, channel, setterUserId: setterId || null, smartleadCampaignId: smartleadId || null } }),
    onSuccess: () => { toast.success("Campaign created"); onDone(); onOpenChange(false); setName(""); setSmartleadId(""); setSetterId(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="call">Call</SelectItem>
            </SelectContent>
          </Select>
          <Select value={setterId} onValueChange={setSetterId}>
            <SelectTrigger><SelectValue placeholder="Setter" /></SelectTrigger>
            <SelectContent>
              {setters.map((s: any) => <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {channel === "email" && (
            <Input placeholder="Smartlead campaign ID (from Smartlead dashboard)" value={smartleadId} onChange={(e) => setSmartleadId(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!name || m.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLeadsDialog({ campaignId, onClose, onDone }: any) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ["ob-leads-for-campaign", search, campaignId],
    queryFn: () => obListLeads({ data: { page: 0, pageSize: 100, search, status: "new", ownerSetterId: "all", emailStatus: "all", niche: "" } }),
    enabled: !!campaignId,
  });

  const m = useMutation({
    mutationFn: () => obAddLeadsToCampaign({ data: { campaignId: campaignId!, leadIds: Array.from(selected) } }),
    onSuccess: (r) => { toast.success(`Added ${r.added}, skipped ${r.skipped}`); onDone(); onClose(); setSelected(new Set()); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!campaignId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add leads to campaign</DialogTitle></DialogHeader>
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-80 overflow-y-auto border border-border rounded-md text-sm">
          {isLoading ? <div className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
            (data as any)?.rows?.map((l: any) => (
              <label key={l.id} className="flex items-center gap-2 p-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} />
                <div className="flex-1">
                  <div>{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "—"}</div>
                  <div className="text-xs text-muted-foreground">{l.email} · {l.email_status} · {l.company?.name}</div>
                </div>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!selected.size || m.isPending} onClick={() => m.mutate()}>Add ({selected.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
