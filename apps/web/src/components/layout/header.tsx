
import * as React from "react";
import {
  IconBell,
  IconSun,
  IconMoon,
  IconCheck,
  IconTrash,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useRouterState, Link } from "@tanstack/react-router";
import { sileo } from "sileo";
import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  websites: "Websites",
  analytics: "Analytics",
  realtime: "Real-time",
  goals: "Goals",
  ai: "AI Insights",
  reports: "Reports",
  "custom-reports": "Custom Reports",
  users: "Users",
  settings: "Settings",
  new: "New",
  view: "View",
  profile: "Profile",
};

function HeaderBreadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs: { label: string; href: string; isLast: boolean }[] = [];
  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;
    const isLast = i === segments.length - 1;

    // Skip UUID-like segments in breadcrumb text, show parent context instead
    const isId = /^[0-9a-f]{8}-/.test(segment) || segment.length > 20;
    const label = isId
      ? "Details"
      : routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

    crumbs.push({ label, href: currentPath, isLast });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <React.Fragment key={crumb.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function Header() {
  const { setTheme } = useTheme();

  const { data: notificationsData, refetch: refetchNotifications } = trpc.notifications.list.useQuery(
    { limit: 20 },
    {
      refetchInterval: 10000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  );

  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unreadCount || 0;

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => refetchNotifications(),
    onError: () => sileo.error({ title: "Failed to mark notification as read" }),
  });

  const deleteNotificationMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => { refetchNotifications(); sileo.success({ title: "Notification deleted" }); },
    onError: () => sileo.error({ title: "Failed to delete notification" }),
  });

  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => { refetchNotifications(); sileo.success({ title: "All notifications marked as read" }); },
    onError: () => sileo.error({ title: "Failed to mark all as read" }),
  });

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "anomaly": return "text-red-600";
      case "goal_achieved": return "text-green-600";
      case "traffic_spike": return "text-blue-600";
      case "conversion": return "text-purple-600";
      default: return "text-gray-600";
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <HeaderBreadcrumbs />
      </div>

      <div className="ml-auto flex items-center gap-1 px-4">
        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <IconSun size={16} className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <IconMoon size={16} className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <IconBell size={16} />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96">
            <div className="flex items-center justify-between p-4 border-b">
              <h4 className="font-semibold text-sm">Notifications</h4>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutateAsync()}
                  className="text-xs h-7"
                >
                  Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="h-[400px]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <IconBell size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map((notif: Notification) => (
                    <div
                      key={notif.id}
                      className={`p-3 rounded-md mb-1.5 transition-colors ${
                        notif.isRead ? "bg-muted/30" : "bg-muted/70"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${!notif.isRead ? getNotificationColor(notif.type) : "bg-gray-400"}`}
                          />
                          <p className="text-xs font-medium flex-1">{notif.title}</p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {!notif.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => markAsReadMutation.mutateAsync({ id: notif.id })}
                            >
                              <IconCheck size={12} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => deleteNotificationMutation.mutateAsync({ id: notif.id })}
                          >
                            <IconTrash size={12} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1 pl-3.5">{notif.message}</p>
                      <div className="flex items-center justify-between pl-3.5">
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(notif.createdAt).toLocaleDateString()}
                        </p>
                        {notif.link && (
                          <Link to={notif.link}>
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                              View
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
