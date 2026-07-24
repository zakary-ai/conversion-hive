import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listUnclaimedPool, claimPoolLead } from "@/lib/api/b2b-pool.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const PAGE = 25;
const opts = (offset: number, search: string) => queryOptions({
  queryKey: ["pool-unclaimed", offset, search],
  queryFn: () => listUnclaimedPool({ data: { limit: PAGE, offset, search: search || undefined } }),
});

export const Route = createFileRoute("/app/_authenticated/b2b/pool")({
  head: () => ({ meta: [{ title: "Lead Pool" }, { name: "description", content: "Claim a lead from the shared pool." }] }),
  component: PoolPage,
});

function PoolPage() {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const { data } = useSuspenseQuery(opts(offset, search));

  const claim = useMutation({
    mutationFn: (id: string) => claimPoolLead({ data: { id } }),
    onSuccess: () => {
      toast.success("Lead claimed");
      qc.invalidateQueries({ queryKey: ["pool-unclaimed"] });
      qc.invalidateQueries({ queryKey: ["my-claimed-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title="Lead Pool" description={`${total} unclaimed leads available`} />

      <Card className="p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(inputVal); }}
        >
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, company, email…" value={inputVal} onChange={(e) => setInputVal(e.target.value)} className="pl-9" />
          </div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Title</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="p-3">{r.company || "—"}</td>
                <td className="p-3">{r.title || "—"}</td>
                <td className="p-3">{r.email || "—"}</td>
                <td className="p-3">{r.phone || "—"}</td>
                <td className="p-3 text-right">
                  <Button size="sm" disabled={claim.isPending} onClick={() => claim.mutate(r.id)}>Claim</Button>
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No unclaimed leads.</td></tr>
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
          <Link to="/app/b2b/leads" className="inline-flex items-center rounded-md border px-3 py-1 text-sm">My leads</Link>
        </div>
      </div>
    </div>
  );
}
