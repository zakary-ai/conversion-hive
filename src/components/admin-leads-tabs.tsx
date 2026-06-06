import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin/leads", label: "Leads" },
  { to: "/admin/scraper", label: "Scraper" },
] as const;

export function AdminLeadsTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {TABS.map((t) => {
        const active = pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
              active ? "bg-background text-foreground shadow" : "hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
