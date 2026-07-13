import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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

const deletionRequestQuery = {
  queryKey: ["my-account-deletion-request"],
  queryFn: () => getMyAccountDeletionRequest(),
} as const;

function DeleteAccountRequestCard() {
  const qc = useQueryClient();
  const { data: existing, isLoading } = useSuspenseQuery({
    ...deletionRequestQuery,
    // Refetch cheaply on mount so status stays fresh.
  } as never) as unknown as { data: { id: string; status: string; reason: string | null; admin_notes: string | null; created_at: string; resolved_at: string | null } | null; isLoading: boolean };

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: () => requestAccountDeletion({ data: { reason: reason.trim() || undefined } }),
    onSuccess: (res) => {
      toast.success(res.already ? "You already have a pending request" : "Deletion request sent to admin");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["my-account-deletion-request"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelMyAccountDeletionRequest(),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-account-deletion-request"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = existing && existing.status === "pending";
  const rejected = existing && existing.status === "rejected";

  return (
    <Card className="p-6 border-destructive/40">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-destructive">Delete account</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Submit a request to have your account permanently deleted. An admin will review and process your request.
          </p>
          {pending && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <div className="font-medium text-amber-600 dark:text-amber-400">Request pending admin review</div>
              <div className="text-xs text-muted-foreground mt-1">
                Submitted {new Date(existing!.created_at).toLocaleString()}
              </div>
              {existing!.reason && (
                <div className="text-xs text-muted-foreground mt-1">Reason: {existing!.reason}</div>
              )}
            </div>
          )}
          {rejected && (
            <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="font-medium">Previous request rejected</div>
              {existing!.admin_notes && (
                <div className="text-xs text-muted-foreground mt-1">Admin notes: {existing!.admin_notes}</div>
              )}
            </div>
          )}
        </div>
        {pending ? (
          <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {cancel.isPending ? "Cancelling…" : "Cancel request"}
          </Button>
        ) : (
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isLoading}>
                <Trash2 className="h-4 w-4 mr-2" />Request deletion
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Request account deletion?</AlertDialogTitle>
                <AlertDialogDescription>
                  An admin will review your request. Optionally tell them why you're leaving.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={2000}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={submit.isPending}
                  onClick={(e) => { e.preventDefault(); submit.mutate(); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {submit.isPending ? "Sending…" : "Send request"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </Card>
  );
}

