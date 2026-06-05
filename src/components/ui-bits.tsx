import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label, value, icon: Icon, hint, className,
}: { label: string; value: string | number; icon?: LucideIcon; hint?: string; className?: string }) {
  return (
    <Card className={cn("p-5 bg-card border-border", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold font-display tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  "New": "bg-primary/15 text-primary border-primary/30",
  "Contacted": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "No Answer": "bg-muted text-muted-foreground border-border",
  "Interested": "bg-success/20 text-success border-success/30",
  "Booked": "bg-success/30 text-success border-success/40",
  "Not Interested": "bg-destructive/15 text-destructive border-destructive/30",
  "Follow Up": "bg-warning/20 text-warning border-warning/30",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
      STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border"
    )}>
      {status}
    </span>
  );
}
