import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, BookOpen, Users, ListChecks, DollarSign, UserCog,
  GraduationCap, Settings, Briefcase, Calendar as CalendarIcon, Inbox,
} from "lucide-react";
import logo from "@/assets/logo.png";


const clientItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Leads", url: "/leads", icon: Briefcase },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Training", url: "/training", icon: GraduationCap },
  { title: "Commissions", url: "/commissions", icon: DollarSign },
  { title: "Profile", url: "/profile", icon: UserCog },
] as const;

const adminItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Setters", url: "/admin/clients", icon: Users },
  { title: "Leads", url: "/admin/leads", icon: Briefcase },
  { title: "Applications", url: "/admin/applications", icon: Inbox },
  { title: "Calendar", url: "/calendar", icon: CalendarIcon },
  { title: "Modules", url: "/admin/modules", icon: BookOpen },
  { title: "Quizzes", url: "/admin/quizzes", icon: ListChecks },
  { title: "Commissions", url: "/admin/commissions", icon: DollarSign },
  { title: "Settings", url: "/admin/settings", icon: Settings },
] as const;

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = isAdmin ? adminItems : clientItems;

  const isActive = (url: string) =>
    url === "/admin" || url === "/dashboard"
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
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{isAdmin ? "Admin" : "Client"}</div>
            </div>
          )}
        </div>
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
