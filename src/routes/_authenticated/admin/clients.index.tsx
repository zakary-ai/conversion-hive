import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listClients, inviteClient, DEFAULT_CLIENT_PASSWORD } from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const opts = queryOptions({ queryKey: ["clients"], queryFn: () => listClients() });

export const Route = createFileRoute("/_authenticated/admin/clients/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: ClientsList,
});

function ClientsList() {
  const { data: clients } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: () => inviteClient({ data: { email, full_name: fullName } }),
    onSuccess: (res) => {
      toast.success("Client invited");
      setCreated({ email: res.email, password: res.default_password });
      setEmail(""); setFullName("");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyCreds = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(
      `Email: ${created.email}\nTemporary password: ${created.password}\n\nSign in and change your password in Profile.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Setters" description={`${clients.length} active`} />
        <Button onClick={() => { setCreated(null); setOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-2" /> Invite setter
        </Button>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3 hidden md:table-cell">Company</th><th className="text-left p-3">Joined</th></tr>
          </thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No setters yet. Invite one to get started.</td></tr>}
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3 font-medium">
                  <Link to="/admin/clients/$userId" params={{ userId: c.user_id }} className="hover:text-primary">
                    {c.full_name || "—"}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground">{c.email}</td>
                <td className="p-3 text-muted-foreground hidden md:table-cell">{c.company_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{created ? "Account created" : "Invite a new setter"}</DialogTitle>
          </DialogHeader>
          {!created ? (
            <div className="space-y-4">
              <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" /></div>
              <p className="text-xs text-muted-foreground">
                A new account will be created with the default password{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">{DEFAULT_CLIENT_PASSWORD}</code>.
                Share these credentials with the setter — they can change the password from their Profile after signing in.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => invite.mutate()}
                  disabled={invite.isPending || !email || !fullName}
                >
                  {invite.isPending ? "Creating…" : "Create account"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Share these sign-in details with the setter. They can change the password from Profile.
              </p>
              <Card className="p-4 space-y-2 font-mono text-sm">
                <div><span className="text-muted-foreground">Email:</span> {created.email}</div>
                <div><span className="text-muted-foreground">Password:</span> {created.password}</div>
              </Card>
              <DialogFooter>
                <Button variant="outline" onClick={copyCreds}>
                  {copied ? <><Check className="h-4 w-4 mr-2" /> Copied</> : <><Copy className="h-4 w-4 mr-2" /> Copy</>}
                </Button>
                <Button onClick={() => { setCreated(null); setOpen(false); }}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
