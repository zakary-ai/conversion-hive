import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

export type CollectionsTarget = {
  person_name: string | null;
  amount_due: number | null;
  due_date: string | null;
};

const VENMO = "@Tyler-Baxter-33";
const CASHAPP = "$ConversionLab";
const SIGN_OFF_LEGAL = "Conversion Lab Legal Team\nlegal@conversionlabeducation.com";
const SIGN_OFF_PLAIN = "Thank you,\nConversion Lab\nlegal@conversionlabeducation.com";

function parseDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
function addBusinessDays(start: Date, days: number) {
  const d = new Date(start);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}
function addDays(start: Date, days: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
}

function methods(link: string) {
  return `Venmo: ${VENMO}\nCash App: ${CASHAPP}\nPayment link: ${link}`;
}

export function CollectionsEmailsDialog({
  target,
  onClose,
}: {
  target: CollectionsTarget | null;
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [agency, setAgency] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const name = target?.person_name?.trim() || "[Client Name]";
  const amount =
    target?.amount_due == null
      ? "[Amount]"
      : Number(target.amount_due).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const paymentLink = link.trim() || "[Payment Link]";
  const agencyName = agency.trim() || "[Collections Agency Name]";

  const dates = useMemo(() => {
    const base = target?.due_date ? parseDay(target.due_date) : null;
    if (!base) {
      return { due: "[Original Due Date]", deadline: "[Deadline]", e2: "[Date of Email 2]", e3: "[Date of Email 3]" };
    }
    return {
      due: fmtDay(base),
      deadline: fmtDay(addBusinessDays(base, 7)),
      e2: fmtDay(addDays(base, 2)),
      e3: fmtDay(addDays(base, 5)),
    };
  }, [target?.due_date]);

  const emails = [
    {
      key: "1",
      title: "Email 1 - Payment reminder (Day 0)",
      subject: `Reminder: Payment of $${amount} Due ${dates.due}`,
      body: `Dear ${name},

This is a friendly reminder from Conversion Lab that your payment of $${amount} USD was due on ${dates.due} and we have not yet received it.

We understand things can slip through the cracks, so no action has been taken on your account at this time. Please submit your payment at your earliest convenience using one of the methods below:

${methods(paymentLink)}

Once your payment is sent, reply to this email with a screenshot or confirmation of the payment attached so we can update your account.

If we do not receive your payment or a response within the next 2 business days, your account will be escalated to our Legal Team and further action may be taken, including a hold on your commissions and restrictions on your program access.

If you have already made this payment or believe this notice was sent in error, simply reply to this email and let us know.

${SIGN_OFF_PLAIN}`,
    },
    {
      key: "2",
      title: "Email 2 - Formal notice (Day 2)",
      subject: `Formal Notice: Outstanding Balance of $${amount} - Commissions Frozen`,
      body: `Dear ${name},

This is a formal notice from the Conversion Lab Legal Team regarding your outstanding balance of $${amount} USD which was due on ${dates.due}.

Your commissions have been frozen effective immediately and will remain on hold until your balance is paid in full.

Please submit your remaining payment of $${amount} no later than ${dates.deadline} using one of the methods below. Failure to do so will result in permanent revocation of your program access without refund.

Accepted payment methods:

${methods(paymentLink)}

Once your payment is sent, reply to this email with a screenshot or confirmation of the payment attached so we can verify it and release your account.

Please be advised that if this balance remains unpaid past the deadline above, this matter will be referred to a third-party collections agency. A collections account may be reported to the credit bureaus and can negatively impact your credit score.

To resolve this immediately, submit your payment and reply to this email with your payment confirmation attached.

${SIGN_OFF_LEGAL}`,
    },
    {
      key: "3",
      title: "Email 3 - Reminder (Day 5)",
      subject: `Reminder: $${amount} Balance Still Outstanding - 3 Days Remaining`,
      body: `Dear ${name},

This is a follow-up to our formal notice sent on ${dates.e2} regarding your outstanding balance of $${amount} USD, originally due on ${dates.due}.

As of today, we have not received your payment or a response. Your commissions remain frozen and will not be released until this balance is paid in full.

You have 3 business days remaining to submit your payment of $${amount} before the deadline of ${dates.deadline}.

Accepted payment methods:

${methods(paymentLink)}

Once your payment is sent, reply to this email with a screenshot or confirmation of the payment attached so we can verify it and release your account.

If payment is not received by that date, your program access will be permanently revoked without refund and your account will be referred to a collections agency. Once an account is placed in collections, it may be reported to the credit bureaus and can hurt your credit score for years.

To resolve this now, submit your payment and reply to this email with your payment confirmation attached. If you believe this notice was sent in error, reply immediately so we can review your account.

${SIGN_OFF_LEGAL}`,
    },
    {
      key: "4",
      title: "Email 4 - Final notice (Day 8)",
      subject: `FINAL NOTICE: Payment of $${amount} Due Tomorrow - Collections Referral Pending`,
      body: `Dear ${name},

This is your final notice from the Conversion Lab Legal Team regarding your outstanding balance of $${amount} USD.

Despite our previous notices on ${dates.e2} and ${dates.e3}, this balance remains unpaid. Your deadline to submit payment is tomorrow, ${dates.deadline}.

If your payment of $${amount} is not received by end of day on ${dates.deadline}, the following will occur without further notice:

Your program access will be permanently revoked without refund. Any frozen commissions will be forfeited and applied toward your outstanding balance. Your account will be referred to ${agencyName}, a third-party collections agency, for recovery of the full amount owed plus any applicable fees. The collections account may be reported to the credit bureaus, which can lower your credit score and remain on your credit report.

This is the last opportunity to resolve this matter directly with Conversion Lab. Submit your payment today using one of the methods below and reply to this email with your payment confirmation attached.

${methods(paymentLink)}

${SIGN_OFF_LEGAL}`,
    },
    {
      key: "5",
      title: "Email 5 - Collections referral (Day 10)",
      subject: `Notice of Collections Referral - Account ${name}`,
      body: `Dear ${name},

The deadline of ${dates.deadline} to resolve your outstanding balance of $${amount} USD has passed without payment.

Effective immediately, your program access has been permanently revoked and your account has been referred to ${agencyName} for recovery of the full balance owed. Any frozen commissions have been forfeited and applied toward the amount outstanding.

From this point forward, all communication regarding this debt will be handled by ${agencyName}. They will contact you directly at the email and phone number on file. Please be aware that a collections account may be reported to the credit bureaus and can negatively affect your credit score.

If you wish to settle this balance before the agency begins its process, you may still submit payment of $${amount} within the next 48 hours via Venmo (${VENMO}), Cash App (${CASHAPP}), or the payment link (${paymentLink}) and reply to this email with your payment confirmation attached. After that window, all payments must be arranged through ${agencyName}.

${SIGN_OFF_LEGAL}`,
    },
  ];

  const copy = async (id: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Collections emails</DialogTitle>
          <DialogDescription>
            Pre-filled for {name}. Copy any email straight into your emailer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Payment link</Label>
            <Input value={link} placeholder="https://..." onChange={(e) => setLink(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Collections agency</Label>
            <Input value={agency} placeholder="Agency name" onChange={(e) => setAgency(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          {emails.map((e) => (
            <Card key={e.key} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{e.title}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(`s${e.key}`, e.subject, "Subject")}>
                    {copied === `s${e.key}` ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    Subject
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copy(`b${e.key}`, e.body, "Email")}>
                    {copied === `b${e.key}` ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    Body
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground break-words">
                <span className="uppercase tracking-wider">Subject:</span> {e.subject}
              </div>
              <pre className="text-xs whitespace-pre-wrap break-words font-sans text-muted-foreground max-h-48 overflow-y-auto">
                {e.body}
              </pre>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
