import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, BookOpen, Users, ListChecks, DollarSign, UserCog,
  GraduationCap, Settings, Briefcase, Calendar as CalendarIcon, Inbox,
  UserPlus, CalendarCheck, ShieldCheck, MessageCircle, Camera, LifeBuoy, UserX,
} from "lucide-react";
import logo from "@/assets/logo.png";

const clientItems = [
  { title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Leads", url: "/app/leads", icon: Briefcase },
  { title: "Email", url: "/app/dm-setter/inbox", icon: Inbox },
  { title: "Calendar", url: "/app/calendar", icon: CalendarIcon },
  { title: "Training", url: "/app/training", icon: GraduationCap },
  { title: "Commissions", url: "/app/commissions", icon: DollarSign },
  { title: "Support", url: "/app/support", icon: LifeBuoy },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

const adminB2BItems = [
  { title: "Dashboard", url: "/app/admin", icon: LayoutDashboard },
  { title: "Setters", url: "/app/admin/clients", icon: Users },
  { title: "Closers", url: "/app/admin/b2b-closers", icon: UserPlus },
  { title: "Leads", url: "/app/admin/leads", icon: Briefcase },
  { title: "Bookings", url: "/app/calendar", icon: CalendarCheck },
  { title: "Modules", url: "/app/admin/modules", icon: BookOpen },
  { title: "Quizzes", url: "/app/admin/quizzes", icon: ListChecks },
  { title: "Commissions", url: "/app/admin/b2b-commissions", icon: DollarSign },
  { title: "Outbound Leads", url: "/app/admin/outbound/leads", icon: Inbox },
  { title: "Campaigns", url: "/app/admin/outbound/campaigns", icon: Briefcase },
  { title: "Tickets", url: "/app/admin/tickets", icon: LifeBuoy },
  { title: "Deletions", url: "/app/admin/account-deletions", icon: UserX },
  { title: "Admins", url: "/app/admin/admins", icon: ShieldCheck },
  { title: "Settings", url: "/app/admin/settings", icon: Settings },
] as const;

const adminB2CItems = [
  { title: "Dashboard", url: "/app/admin", icon: LayoutDashboard },
  { title: "Bookings", url: "/app/admin/bookings", icon: CalendarCheck },
  { title: "Closers", url: "/app/admin/closers", icon: UserPlus },
  { title: "DM Setters", url: "/app/admin/dm-setters", icon: MessageCircle },
  { title: "Commissions", url: "/app/admin/b2c-commissions", icon: DollarSign },
  { title: "Tickets", url: "/app/admin/tickets", icon: LifeBuoy },
  { title: "Deletions", url: "/app/admin/account-deletions", icon: UserX },
  { title: "Settings", url: "/app/admin/settings", icon: Settings },
] as const;

const closerItems = [
  { title: "Home", url: "/app/closer", icon: LayoutDashboard },
  { title: "Calendar", url: "/app/closer/calendar", icon: CalendarIcon },
  { title: "Commissions", url: "/app/closer/commissions", icon: DollarSign },
  { title: "Support", url: "/app/support", icon: LifeBuoy },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

const dmSetterItems = [
  { title: "Home", url: "/app/dm-setter", icon: LayoutDashboard },
  { title: "Log DMs", url: "/app/dm-setter/logs", icon: Camera },
  { title: "Inbox", url: "/app/dm-setter/inbox", icon: Inbox },
  { title: "Calendar", url: "/app/dm-setter/calendar", icon: CalendarIcon },
  { title: "Training", url: "/app/training", icon: GraduationCap },
  { title: "Commissions", url: "/app/commissions", icon: DollarSign },
  { title: "Support", url: "/app/support", icon: LifeBuoy },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;

const dmManagerItems = [
  { title: "Home", url: "/app/dm-manager", icon: LayoutDashboard },
  { title: "Log DMs", url: "/app/dm-setter/logs", icon: Camera },
  { title: "Inbox", url: "/app/dm-setter/inbox", icon: Inbox },
  { title: "Calendar", url: "/app/dm-setter/calendar", icon: CalendarIcon },
  { title: "Training", url: "/app/training", icon: GraduationCap },
  { title: "Commissions", url: "/app/commissions", icon: DollarSign },
  { title: "Support", url: "/app/support", icon: LifeBuoy },
  { title: "Profile", url: "/app/profile", icon: UserCog },
] as const;


const CHANNEL_KEY = "cl_admin_channel";
export type AdminChannel = "b2b" | "b2c";

export function useAdminChannel(): [AdminChannel, (c: AdminChannel) => void] {
  const [channel, setChannel] = useState<AdminChannel>("b2b");
  useEffect(() => {
    const v = (typeof window !== "undefined" && localStorage.getItem(CHANNEL_KEY)) as AdminChannel | null;
    if (v === "b2b" || v === "b2c") setChannel(v);
    const onStorage = () => {
      const next = localStorage.getItem(CHANNEL_KEY) as AdminChannel | null;
      if (next === "b2b" || next === "b2c") setChannel(next);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("admin-channel-change", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("admin-channel-change", onStorage);
    };
  }, []);
  const set = (c: AdminChannel) => {
    localStorage.setItem(CHANNEL_KEY, c);
    setChannel(c);
    window.dispatchEvent(new Event("admin-channel-change"));
  };
  return [channel, set];
}

export function AppSidebar({ isAdmin, isCloser, isDmSetter, isDmSetterManager }: { isAdmin: boolean; isCloser?: boolean; isDmSetter?: boolean; isDmSetterManager?: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [channel, setChannel] = useAdminChannel();

  const items = isAdmin
    ? channel === "b2c" ? adminB2CItems : adminB2BItems
    : isDmSetterManager ? dmManagerItems
    : isDmSetter ? dmSetterItems
    : isCloser ? closerItems : clientItems;

  const label = isAdmin ? "Admin" : isDmSetterManager ? "DM Manager" : isDmSetter ? "DM Setter" : isCloser ? "Closer" : "Setter";

  const isActive = (url: string) =>
    url === "/app/admin" || url === "/app/dashboard" || url === "/app/closer" || url === "/app/dm-setter" || url === "/app/dm-manager"
      ? pathname === url
      : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden glow-primary">
            <img src={logo} alt="Conversion Lab" width={32} height={32} className="h-full w-full object-cover" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-semibold tracking-tight">Conversion Lab</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            </div>
          )}
        </div>
        {isAdmin && !collapsed && (
          <div className="px-2 pb-2">
            <div className="inline-flex w-full rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChannel("b2b")}
                className={`flex-1 rounded-md px-2 py-1 font-medium transition ${channel === "b2b" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >B2B</button>
              <button
                type="button"
                onClick={() => setChannel("b2c")}
                className={`flex-1 rounded-md px-2 py-1 font-medium transition ${channel === "b2c" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >B2C</button>
            </div>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{isAdmin ? "Manage" : "Workspace"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
