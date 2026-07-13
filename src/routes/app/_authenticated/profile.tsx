import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { meQueryOptions } from "./route";
import { updateProfile, changeMyPassword, requestAccountDeletion, getMyAccountDeletionRequest, cancelMyAccountDeletionRequest } from "@/lib/api/cl.functions";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-bits";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain – no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Toronto", label: "Eastern (Toronto)" },
  { value: "America/Mexico_City", label: "Central (Mexico City)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris / Berlin" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const Route = createFileRoute("/app/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(me.profile?.full_name ?? "");
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
    mutationFn: () => updateProfile({ data: { full_name: fullName, timezone } }),
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["me"] }); },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profile" />
      <Card className="p-6 space-y-4">
        <div><Label>Email</Label><Input value={me.profile?.email ?? ""} disabled className="mt-1" /></div>
        <div><Label>Full name</Label><Input value={fullName} disabled className="mt-1" /><p className="text-xs text-muted-foreground mt-1">Contact an admin to change your name.</p></div>
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display font-semibold">Sign out</h3>
            <p className="text-sm text-muted-foreground mt-1">End your session on this device.</p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await qc.cancelQueries();
              qc.clear();
              await supabase.auth.signOut();
              toast.success("Signed out");
              navigate({ to: "/app/auth", replace: true });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </Card>

      <DeleteAccountRequestCard />


      <p className="text-center text-xs text-muted-foreground pt-2">
        <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-foreground hover:underline">Terms of Use</Link>
      </p>
    </div>
  );
}

function DeleteAccountButton({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const del = useMutation({
    mutationFn: () => deleteMyAccount(),
    onSuccess: async () => {
      toast.success("Account deleted");
      await supabase.auth.signOut();
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive"><Trash2 className="h-4 w-4 mr-2" />Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes your login, profile, and personal data. Type <strong>DELETE</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirm !== "DELETE" || del.isPending}
            onClick={(e) => { e.preventDefault(); del.mutate(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending ? "Deleting…" : "Delete forever"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
