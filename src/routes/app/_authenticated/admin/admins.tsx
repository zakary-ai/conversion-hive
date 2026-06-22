import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listAdmins,
  inviteAdmin,
  resendAdminInvite,
  revokeAdmin,
  DEFAULT_CLIENT_PASSWORD,
} from "@/lib/api/cl.functions";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldPlus, Copy, Check, Mail, ShieldOff } from "lucide-react";
import { toast } from "sonner";

const opts = queryOptions({ queryKey: ["admins"], queryFn: () => listAdmins() });

export const Route = createFileRoute("/app/_authenticated/admin/admins")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: AdminsList,
});

function AdminsList() {
  const { data: admins } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: () => inviteAdmin({ data: { email, full_name: fullName } }),
    onSuccess: (res) => {
      toast.success("Admin invited");
      setCreated({ email: res.email, password: res.default_password });
      setEmail("");
      setFullName("");
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resend = useMutation({
    mutationFn: (userId: string) => resendAdminInvite({ data: { user_id: userId } }),
    onSuccess: (res) => toast.success(`Sign-in link resent to ${res.email}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => revokeAdmin({ data: { user_id: userId } }),
    onSuccess: () => {
      toast.success("Admin access revoked");
      qc.invalidateQueries({ queryKey: ["admins"] });
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
        <PageHeader title="Admins" description={`${admins.length} active`} />
        <Button onClick={() => { setCreated(null); setOpen(true); }}>
          <ShieldPlus className="h-4 w-4 mr-2" /> Invite admin
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Granted</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No admins yet.</td></tr>
            )}
            {admins.map((a) => (
              <tr key={a.user_id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3 font-medium">
                  {a.full_name || "—"}
                  {a.is_self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </td>
                <td className="p-3 text-muted-foreground">{a.email || "—"}</td>
                <td className="p-3 text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-2 flex-wrap justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!a.email || (resend.isPending && resend.variables === a.user_id)}
                      onClick={() => resend.mutate(a.user_id)}
                    >
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                      {resend.isPending && resend.variables === a.user_id ? "Sending…" : "Resend invite"}
                    </Button>
                    {!a.is_self && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={revoke.isPending && revoke.variables === a.user_id}
                        onClick={() => {
                          if (confirm(`Revoke admin access for ${a.email || a.full_name}?`)) {
                            revoke.mutate(a.user_id);
                          }
                        }}
                      >
                        <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                        {revoke.isPending && revoke.variables === a.user_id ? "Revoking…" : "Revoke"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{created ? "Admin account ready" : "Invite a new admin"}</DialogTitle>
          </DialogHeader>
          {!created ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@company.com" />
              </div>
              <p className="text-xs text-muted-foreground">
                If the email already has an account, admin access will be added to it. Otherwise a new account is created with the temporary password{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">{DEFAULT_CLIENT_PASSWORD}</code>.
                They'll be required to set a new password on first sign-in.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => invite.mutate()} disabled={invite.isPending || !email || !fullName}>
                  {invite.isPending ? "Creating…" : "Grant admin access"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The invite email has been sent. You can also share these credentials directly.
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
