import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Briefcase, Calendar as CalendarIcon, Settings,
  GraduationCap, UserCog, CalendarCheck, UserPlus, DollarSign, MessageCircle, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminChannel } from "@/components/app-sidebar";

const clientItems = [
  { title: "Home", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Leads", url: "/app/leads", icon: Briefcase },
  { title: "Calendar", url: "/app/calendar", icon: CalendarIcon },
  { title: "Training", url: "/app/training", icon: GraduationCap },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

const adminB2BItems = [
  { title: "Home", url: "/app/admin", icon: LayoutDashboard },
  { title: "Leads", url: "/app/admin/leads", icon: Briefcase },
  { title: "Bookings", url: "/app/calendar", icon: CalendarCheck },
  { title: "Setters", url: "/app/admin/clients", icon: Users },
  { title: "Settings", url: "/app/admin/settings", icon: Settings },
] as const;

const adminB2CItems = [
  { title: "Home", url: "/app/admin", icon: LayoutDashboard },
  { title: "Bookings", url: "/app/admin/bookings", icon: CalendarCheck },
  { title: "DM Setters", url: "/app/admin/dm-setters", icon: MessageCircle },
  { title: "Closers", url: "/app/admin/closers", icon: UserPlus },
  { title: "Commissions", url: "/app/admin/b2c-commissions", icon: DollarSign },
] as const;

const closerItems = [
  { title: "Home", url: "/app/closer", icon: LayoutDashboard },
  { title: "Calendar", url: "/app/closer/calendar", icon: CalendarIcon },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

const dmSetterItems = [
  { title: "Home", url: "/app/dm-setter", icon: LayoutDashboard },
  { title: "Log DMs", url: "/app/dm-setter/logs", icon: Camera },
  { title: "Calendar", url: "/app/dm-setter/calendar", icon: CalendarIcon },
  { title: "Commissions", url: "/app/commissions", icon: DollarSign },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

const dmManagerItems = [
  { title: "Home", url: "/app/dm-manager", icon: LayoutDashboard },
  { title: "Commissions", url: "/app/commissions", icon: DollarSign },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

export function BottomNav({ isAdmin, isCloser, isDmSetter, isDmSetterManager }: { isAdmin: boolean; isCloser?: boolean; isDmSetter?: boolean; isDmSetterManager?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [channel] = useAdminChannel();
  const items = isAdmin
    ? channel === "b2c" ? adminB2CItems : adminB2BItems
    : isDmSetterManager ? dmManagerItems
    : isDmSetter ? dmSetterItems
    : isCloser ? closerItems : clientItems;

  const isActive = (url: string) =>
    url === "/app/admin" || url === "/app/dashboard" || url === "/app/closer" || url === "/app/dm-setter" || url === "/app/dm-manager"
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
