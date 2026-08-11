import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  justcallListSetters, justcallSetSetterMapping, justcallStatus,
} from "@/lib/api/justcall.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/app/_authenticated/admin/justcall-setup")({
  head: () => ({
    meta: [
      { title: "JustCall Setup" },
      { name: "description", content: "Map setters to their JustCall agent accounts and copy the webhook URL." },
    ],
  }),
  component: JustcallSetupPage,
});

function JustcallSetupPage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["justcall-status"], queryFn: () => justcallStatus() });
  const setters = useQuery({ queryKey: ["justcall-setters"], queryFn: () => justcallListSetters() });

  const [copied, setCopied] = useState(false);
  const webhookUrl = status.data?.webhookUrl;
  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="JustCall Setup"
        description="Link each setter to their JustCall agent so live call pops find the right lead card."
      />

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={status.data?.hasApi ? "default" : "destructive"}>
            {status.data?.hasApi ? "API credentials configured" : "API credentials missing"}
          </Badge>
          {status.data?.error && (
            <span className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {status.data.error}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label>Webhook URL for JustCall</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl ?? "Generate secret first"} />
            <Button
              variant="outline" size="icon" disabled={!webhookUrl}
              onClick={copyWebhook}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste this URL into JustCall under Settings → Webhooks → Call events. The secret is already in the query string.
          </p>
        </div>

        <div className="text-xs text-muted-foreground">
          Need help? JustCall docs: {" "}
          <a href="https://docs.justcall.io/" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            docs.justcall.io
          </a>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-medium mb-3">Setter mapping</div>
        {setters.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading setters…
          </div>
        ) : (
          <div className="space-y-3">
            {setters.data?.map((s) => (
              <SetterRow
                key={s.user_id}
                setter={s}
                agents={status.data?.agents ?? []}
                onSaved={() => {
                  toast.success("Mapping saved");
                  qc.invalidateQueries({ queryKey: ["justcall-setters"] });
                }}
              />
            ))}
            {!setters.data?.length && (
              <div className="text-sm text-muted-foreground">No setters with the <code>b2b_setter</code> role found.</div>
            )}
          </div>
        )}
      </Card>

      <div className="flex justify-start">
        <Button asChild variant="outline">
          <Link to="/app/admin">Back to admin</Link>
        </Button>
      </div>
    </div>
  );
}

function SetterRow({ setter, agents, onSaved }: {
  setter: any;
  agents: Array<{ id: string; name: string; email: string | null; numbers: string[] }>;
  onSaved: () => void;
}) {
  const [agentId, setAgentId] = useState(setter.justcall_agent_id ?? "none");
  const [agentEmail, setAgentEmail] = useState(setter.justcall_agent_email ?? "");
  const [number, setNumber] = useState(setter.justcall_number_e164 ?? "");
  const mapping = useMutation({
    mutationFn: () =>
      justcallSetSetterMapping({
        data: {
          user_id: setter.user_id,
          agent_id: agentId === "none" ? null : agentId,
          agent_email: agentEmail.trim() || null,
          number_e164: number.trim() || null,
        },
      }),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = agents.find((a) => a.id === (agentId === "none" ? null : agentId));

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{setter.full_name || setter.email}</div>
        <Button size="sm" disabled={mapping.isPending} onClick={() => mapping.mutate()}>
          {mapping.isPending ? "Saving…" : "Save mapping"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">JustCall agent</Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No mapping</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} {a.email ? `(${a.email})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Agent email (fallback if API agent list is empty)</Label>
          <Input value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} placeholder="agent@company.com" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">JustCall number (E.164)</Label>
          <Input
            list={`numbers-${setter.user_id}`}
            value={number === "custom" ? "" : number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="+1234567890"
          />
          <datalist id={`numbers-${setter.user_id}`}>
            <option value="">No number</option>
            {(selected?.numbers ?? []).map((n: string) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </div>
    </div>
  );
}
