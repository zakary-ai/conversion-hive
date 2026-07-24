import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyClaimedLeads } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogCallOutcomeDialog } from "@/components/log-call-outcome-dialog";
import { B2bLeadDetailDialog } from "@/components/b2b-lead-detail-dialog";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

type Tab = "all" | "uncontacted" | "booked" | "no_answer" | "not_interested";
const PAGE = 20;

const opts = (tab: Tab, search: string, offset: number) =>
  queryOptions({
    queryKey: ["my-claimed-leads", tab, search, offset],
    queryFn: () => listMyClaimedLeads({ data: { tab, search: search || undefined, limit: PAGE, offset } }),
  });

export const Route = createFileRoute("/app/_authenticated/b2b/leads")({
  head: () => ({ meta: [{ title: "My Leads" }, { name: "description", content: "Leads you've claimed from the pool." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(opts("all", "", 0)),
  component: MyLeadsPage,
});

function MyLeadsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [inputVal, setInputVal] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const { data } = useSuspenseQuery(opts(tab, search, offset));

  const [preview, setPreview] = useState<any | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="My leads" description={`${total} lead${total === 1 ? "" : "s"}`} />

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setOffset(0); }}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="uncontacted">Uncontacted</TabsTrigger>
          <TabsTrigger value="booked">Booked</TabsTrigger>
          <TabsTrigger value="no_answer">Didn't pick up</TabsTrigger>
          <TabsTrigger value="not_interested">Not interested</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(inputVal); }}
        >
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, company, email, phone…" value={inputVal} onChange={(e) => setInputVal(e.target.value)} className="pl-9" />
          </div>
          <Button type="submit" variant="outline">Search</Button>
          {search && (
            <Button type="button" variant="ghost" onClick={() => { setInputVal(""); setSearch(""); setOffset(0); }}>Clear</Button>
          )}
        </form>
      </Card>

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
            {data.rows.map((l: any) => (
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
                <td className="p-3">
                  <Badge variant={l.status === "booked" ? "default" : l.status === "burned" ? "destructive" : "secondary"}>
                    {l.status === "burned" ? "not interested" : l.didnt_pick_up ? "didn't pick up" : l.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                No leads in this view. Head to <Link to="/app/b2b/pool" className="underline">Lead Pool</Link> to claim some.
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Page {page} of {pages}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <B2bLeadDetailDialog
        lead={preview}
        onClose={() => setPreview(null)}
        onLogOutcome={() => setLogOpen(true)}
      />

      {preview && (
        <LogCallOutcomeDialog
          lead={{ id: preview.id, first_name: preview.first_name, last_name: preview.last_name }}
          open={logOpen}
          onClose={() => { setLogOpen(false); setPreview(null); }}
        />
      )}
    </div>
  );
}
