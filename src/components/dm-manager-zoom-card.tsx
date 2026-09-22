import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { getMyManagerZoom, saveMyManagerZoom, testMyManagerZoom } from "@/lib/api/dm-manager.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function DmManagerZoomCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-manager-zoom"], queryFn: () => getMyManagerZoom() });
  const [form, setForm] = useState({ accountId: "", clientId: "", clientSecret: "", hostEmail: "" });

  useEffect(() => {
    if (!data) return;
    setForm({
      accountId: data.zoom_account_id,
      clientId: data.zoom_client_id,
      clientSecret: "",
      hostEmail: data.zoom_host_email,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveMyManagerZoom({
        data: {
          zoom_account_id: form.accountId,
          zoom_client_id: form.clientId,
          ...(form.clientSecret ? { zoom_client_secret: form.clientSecret } : {}),
          zoom_host_email: form.hostEmail,
        },
      }),
    onSuccess: () => {
      toast.success("Zoom credentials saved");
      setForm((f) => ({ ...f, clientSecret: "" }));
      qc.invalidateQueries({ queryKey: ["my-manager-zoom"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testMyManagerZoom(),
    onSuccess: () => toast.success("Zoom connected - a test meeting was created successfully"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-3">
      <div className="flex items-center gap-2">
        <div className="font-display font-semibold">Zoom for your 1-on-1 calls</div>
        {data?.configured ? (
          <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] gap-1"><AlertCircle className="h-3 w-3" /> Not set up</Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Add your Zoom Server-to-Server OAuth keys here so bookings on your link create meetings on your own Zoom. Until then, the company Zoom account is used.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Account ID</label>
          <Input value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} placeholder="Account ID" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Client ID</label>
          <Input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} placeholder="Client ID" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Client Secret</label>
          <Input
            type="password"
            value={form.clientSecret}
            onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
            placeholder={data?.has_secret ? "•••••••• (leave blank to keep)" : "Client Secret"}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Zoom host email (optional)</label>
          <Input value={form.hostEmail} onChange={(e) => setForm({ ...form, hostEmail: e.target.value })} placeholder="you@example.com" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save Zoom keys"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !data?.configured}>
          {test.isPending ? "Testing…" : "Test connection"}
        </Button>
      </div>
    </Card>
  );
}
