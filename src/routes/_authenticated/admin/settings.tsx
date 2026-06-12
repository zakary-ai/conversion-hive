import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Phone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { listNumberPool, addNumberToPool, removeNumberFromPool } from "@/lib/api/calls.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Platform configuration." />

      <PhoneNumberPool />

      <Card className="p-6">
        <h3 className="font-display font-semibold mb-2">Lead scraper</h3>
        <p className="text-sm text-muted-foreground">
          Each client is targeted for up to 75 active leads per day. The scraper integration
          will populate the leads table automatically once connected.
        </p>
      </Card>
      <Card className="p-6">
        <h3 className="font-display font-semibold mb-2">Roles</h3>
        <p className="text-sm text-muted-foreground">
          New signups default to the Client role. To promote a user to Admin, insert a row
          into the user_roles table via the backend.
        </p>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold">Sign out</h3>
            <p className="text-sm text-muted-foreground mt-1">End your session on this device.</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PhoneNumberPool() {
  const qc = useQueryClient();
  const { data: pool = [], isLoading } = useQuery({
    queryKey: ["openphone-pool"],
    queryFn: () => listNumberPool(),
  });

  const [phone, setPhone] = useState("");
  const [opId, setOpId] = useState("");
  const [note, setNote] = useState("");

  const add = useMutation({
    mutationFn: () => addNumberToPool({ data: { phone_e164: phone, openphone_number_id: opId, note } }),
    onSuccess: () => {
      toast.success("Number added to pool");
      setPhone(""); setOpId(""); setNote("");
      qc.invalidateQueries({ queryKey: ["openphone-pool"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeNumberFromPool({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["openphone-pool"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-display font-semibold flex items-center gap-2"><Phone className="h-4 w-4" /> OpenPhone (Quo) number pool</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Buy numbers in OpenPhone, then paste each number + its OpenPhone number ID here.
          New client signups draw from this pool automatically.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Phone (E.164)</Label>
          <Input placeholder="+15551234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">OpenPhone number ID</Label>
          <Input placeholder="PN..." value={opId} onChange={(e) => setOpId(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Note (optional)</Label>
          <Input placeholder="e.g. Austin area code" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => add.mutate()} disabled={!phone || !opId || add.isPending} size="sm">Add to pool</Button>

      <div className="border-t border-border pt-3">
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!isLoading && pool.length === 0 && <div className="text-xs text-muted-foreground">Pool is empty.</div>}
        {pool.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-2">Number</th><th className="text-left p-2">Assigned to</th><th className="text-left p-2">Note</th><th></th></tr>
            </thead>
            <tbody>
              {pool.map((row) => {
                const p = (row as { profiles?: { full_name?: string; email?: string } | null }).profiles;
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2 font-mono">{row.phone_e164}</td>
                    <td className="p-2">{p?.full_name || p?.email || <span className="text-muted-foreground">— free —</span>}</td>
                    <td className="p-2 text-muted-foreground">{row.note}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(row.id)} disabled={!!row.assigned_user_id || remove.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
