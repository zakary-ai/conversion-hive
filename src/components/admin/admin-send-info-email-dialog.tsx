import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminListB2bSetters, adminSendInfoEmail } from "@/lib/api/b2b-pool.functions";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AdminSendInfoEmailButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [setterId, setSetterId] = useState("");

  const setters = useQuery({
    queryKey: ["admin-b2b-setters"],
    queryFn: () => adminListB2bSetters(),
    enabled: open,
  });

  const send = useMutation({
    mutationFn: () => adminSendInfoEmail({ data: { email: email.trim(), name: name.trim() || undefined, setter_user_id: setterId } }),
    onSuccess: (r) => {
      toast.success(`One-pager sent to ${r.email}`);
      setOpen(false);
      setEmail("");
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && !!setterId;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-2" /> Send 1-pager
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send information one-pager</DialogTitle>
            <DialogDescription>
              Emails the ChatGPT-ads overview with the selected setter's booking link, so the
              booking is credited to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                className="mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prospect@company.com"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">First name (optional)</Label>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Book with setter</Label>
              <Select value={setterId} onValueChange={setSetterId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={setters.isLoading ? "Loading setters…" : "Select a setter"} />
                </SelectTrigger>
                <SelectContent>
                  {((setters.data?.rows ?? []) as { user_id: string; full_name: string }[]).map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                  {setters.data && setters.data.rows.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No B2B setters found</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => send.mutate()} disabled={!valid || send.isPending}>
              {send.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
