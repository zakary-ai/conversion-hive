import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { meQueryOptions } from "./route";
import { updateProfile, bootstrapAdmin, changeMyPassword } from "@/lib/api/cl.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(me.profile?.full_name ?? "");
  const [company, setCompany] = useState(me.profile?.company_name ?? "");
  const [timezone, setTimezone] = useState(
    (me.profile as unknown as { timezone?: string } | null)?.timezone ?? "America/New_York"
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePw = useMutation({
    mutationFn: () => changeMyPassword({ data: { new_password: newPassword } }),
    onSuccess: () => {
      toast.success("Password updated");
      setNewPassword(""); setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => updateProfile({ data: { full_name: fullName, company_name: company, timezone } }),
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["me"] }); },
  });

  // Check if any admin exists (client-side, RLS allows admins/own to see roles)
  const adminCheck = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { count } = await supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
      return (count ?? 0) > 0;
    },
    enabled: !me.isAdmin,
  });

  const promote = useMutation({
    mutationFn: () => bootstrapAdmin(),
    onSuccess: async () => {
      toast.success("You are now an admin");
      await qc.invalidateQueries();
      navigate({ to: "/admin" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profile" />
      <Card className="p-6 space-y-4">
        <div><Label>Email</Label><Input value={me.profile?.email ?? ""} disabled className="mt-1" /></div>
        <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" /></div>
        <div><Label>Company</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1" /></div>
        <div>
          <Label>Time zone</Label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Booking slots will be shown in this time zone.</p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
      </Card>

      {!me.isAdmin && adminCheck.data === false && (
        <Card className="p-6 border-primary/40">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h3 className="font-display font-semibold">First-time setup</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No admin exists yet. Promote yourself to admin to access the admin dashboard
                and start managing modules, leads, and commissions.
              </p>
              <Button className="mt-3" onClick={() => promote.mutate()} disabled={promote.isPending}>
                Make me admin
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div>
          <h3 className="font-display font-semibold">Change password</h3>
          <p className="text-sm text-muted-foreground mt-1">Use at least 8 characters.</p>
        </div>
        <div><Label>New password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" /></div>
        <div><Label>Confirm new password</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" /></div>
        <Button
          onClick={() => {
            if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
            if (newPassword !== confirmPassword) return toast.error("Passwords don't match");
            changePw.mutate();
          }}
          disabled={changePw.isPending || !newPassword}
        >
          {changePw.isPending ? "Updating…" : "Update password"}
        </Button>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold">Sign out</h3>
            <p className="text-sm text-muted-foreground mt-1">End your session on this device.</p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              toast.success("Signed out");
              navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
