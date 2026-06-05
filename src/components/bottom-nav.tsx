import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, BookOpen, Users, ListChecks, DollarSign, UserCog,
  GraduationCap, Settings, Briefcase, Calendar as CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const clientItems = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Leads", url: "/leads", icon: Briefcase },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Training", url: "/training", icon: GraduationCap },
  { title: "Profile", url: "/profile", icon: UserCog },
] as const;

const adminItems = [
  { title: "Home", url: "/admin", icon: LayoutDashboard },
  { title: "Leads", url: "/admin/leads", icon: Briefcase },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Clients", url: "/admin/clients", icon: Users },
  { title: "Settings", url: "/admin/settings", icon: Settings },
] as const;

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = isAdmin ? adminItems : clientItems;

  const isActive = (url: string) =>
    url === "/admin" || url === "/dashboard"
      ? pathname === url
      : pathname === url || pathname.startsWith(url + "/");

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">

        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <li key={item.url}>
              <Link
                to={item.url}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 px-1 text-[10px] font-medium transition-colors min-h-[56px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_oklch(var(--primary)/0.6)]")} />
                <span className="leading-none truncate max-w-full">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
