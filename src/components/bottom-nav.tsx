import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Briefcase, Calendar as CalendarIcon, Settings,
  GraduationCap, UserCog, Inbox, CalendarCheck, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminChannel } from "@/components/app-sidebar";

const clientItems = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Leads", url: "/leads", icon: Briefcase },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Training", url: "/training", icon: GraduationCap },
  { title: "Profile", url: "/profile", icon: UserCog },
] as const;

const adminB2BItems = [
  { title: "Home", url: "/admin", icon: LayoutDashboard },
  { title: "Leads", url: "/admin/leads", icon: Briefcase },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Setters", url: "/admin/clients", icon: Users },
  { title: "Settings", url: "/admin/settings", icon: Settings },
] as const;

const adminB2CItems = [
  { title: "Home", url: "/admin", icon: LayoutDashboard },
  { title: "Apps", url: "/admin/applications", icon: Inbox },
  { title: "Bookings", url: "/admin/bookings", icon: CalendarCheck },
  { title: "Closers", url: "/admin/closers", icon: UserPlus },
  { title: "Settings", url: "/admin/settings", icon: Settings },
] as const;

const closerItems = [
  { title: "Home", url: "/closer", icon: LayoutDashboard },
  { title: "Calendar", url: "/closer/calendar", icon: CalendarIcon },
  { title: "Profile", url: "/profile", icon: UserCog },
] as const;

export function BottomNav({ isAdmin, isCloser }: { isAdmin: boolean; isCloser?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [channel] = useAdminChannel();
  const items = isAdmin
    ? channel === "b2c" ? adminB2CItems : adminB2BItems
    : isCloser ? closerItems : clientItems;

  const isActive = (url: string) =>
    url === "/admin" || url === "/dashboard" || url === "/closer"
      ? pathname === url
      : pathname === url || pathname.startsWith(url + "/");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 h-14 border-t border-border bg-card md:hidden">
      <ul className={cn("grid h-full", `grid-cols-${items.length}`)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <li key={item.url}>
              <Link
                to={item.url}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 px-1 pt-1 pb-1 text-[10px] font-medium transition-colors",
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
