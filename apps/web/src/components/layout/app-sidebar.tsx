
import {
  IconChartBar,
  IconGlobe,
  IconLayoutDashboard,
  IconSettings,
  IconUsers,
  IconFileText,
  IconLogout,
  IconUser,
  IconActivity,
  IconTarget,
  IconFileAnalytics,
  IconSparkles,
  IconSearch,
  IconBook,
  IconShieldCheck,
  IconFilter,
  IconGauge,
  IconWorldSearch,
} from "@tabler/icons-react";
import { useSession, useSignOut } from "@/lib/auth";
import { useRouter, useRouterState, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

function getNavigationItems(session: { user?: { role?: string; isSuperAdmin?: boolean } } | null | undefined) {
  const items = [
    { title: "Dashboard", url: "/dashboard", icon: IconLayoutDashboard },
    { title: "Websites", url: "/websites", icon: IconGlobe },
    { title: "Analytics", url: "/analytics", icon: IconChartBar },
    { title: "Real-time", url: "/realtime", icon: IconActivity },
    { title: "Goals", url: "/goals", icon: IconTarget },
    { title: "Funnels", url: "/analytics?tab=funnels", icon: IconFilter },
    { title: "Search Console", url: "/search-console", icon: IconWorldSearch },
    { title: "Speed Insights", url: "/speed-insights", icon: IconGauge },
    { title: "AI Insights", url: "/ai", icon: IconSparkles },
    { title: "Reports", url: "/reports", icon: IconFileText },
    { title: "Custom Reports", url: "/custom-reports", icon: IconFileAnalytics },
    { title: "Users", url: "/users", icon: IconUsers },
    { title: "Docs", url: "/docs", icon: IconBook },
    { title: "Settings", url: "/settings", icon: IconSettings },
  ];

  if (session?.user?.isSuperAdmin) {
    // Insert Admin before Docs
    const docsIdx = items.findIndex(i => i.url === "/docs");
    items.splice(docsIdx, 0, { title: "Admin", url: "/admin", icon: IconShieldCheck });
  }

  return items;
}

export function AppSidebar() {
  const { data: session } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const signOutMutation = useSignOut();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const utils = trpc.useUtils();

  const [searchResults, setSearchResults] = useState<
    { type: string; id: string; title: string; description: string; url: string }[]
  >([]);

  const performSearch = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await utils.search.query.fetch({ q: query });
        setSearchResults(results.results);
      } catch {
        setSearchResults([]);
      }
    },
    [utils]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery) performSearch(searchQuery);
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, performSearch]);

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSignOut = async () => {
    await signOutMutation.mutateAsync();
    window.location.href = "/auth/signin";
  };

  return (
    <>
      <Sidebar
        variant="inset"
        className="[&_[data-slot='sidebar-inner']]:bg-card/70 [&_[data-slot='sidebar-inner']]:backdrop-blur-sm [&_[data-slot='sidebar-inner']]:rounded-lg [&_[data-slot='sidebar-inner']]:border [&_[data-slot='sidebar-inner']]:shadow-sm [&_[data-slot='sidebar-inner']]:border-sidebar-border"
      >
        <SidebarHeader>
          <div className="flex items-center justify-center px-4 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground">
              <img src="/logo.png" alt="Logo" width={32} height={32} />
            </div>
          </div>
          {/* Search trigger */}
          <div className="px-2 pb-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-full items-center gap-2 rounded-md border border-input bg-background/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <IconSearch size={14} />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {getNavigationItems(session).map((item) => {
                  // TanStack Router's <Link to=> doesn't parse '?foo=bar' out
                  // of the path string. Split it into to + search so search
                  // params actually propagate (e.g. Funnels → /analytics?tab=funnels).
                  const [pathOnly, queryStr] = item.url.split("?");
                  const searchObj: Record<string, string> = {};
                  if (queryStr) {
                    for (const kv of queryStr.split("&")) {
                      const [k, v = ""] = kv.split("=");
                      if (k) searchObj[decodeURIComponent(k)] = decodeURIComponent(v);
                    }
                  }
                  const isActive = pathname === pathOnly;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link to={pathOnly} search={queryStr ? (searchObj as never) : undefined}>
                          <item.icon size={16} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage
                        src={session?.user?.image || ""}
                        alt={session?.user?.name || ""}
                      />
                      <AvatarFallback className="rounded-lg">
                        {session?.user?.name?.charAt(0) ||
                          session?.user?.email?.charAt(0) ||
                          "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {session?.user?.name || "User"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {session?.user?.email}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage
                          src={session?.user?.image || ""}
                          alt={session?.user?.name || ""}
                        />
                        <AvatarFallback className="rounded-lg">
                          {session?.user?.name?.charAt(0) ||
                            session?.user?.email?.charAt(0) ||
                            "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">
                          {session?.user?.name || "User"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {session?.user?.email}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="flex items-center gap-2">
                      <IconSettings size={16} />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                  >
                    <IconLogout size={16} />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* Command palette search */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput
          placeholder="Search websites, goals, reports..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>
            {searchQuery.length < 2 ? "Type to search..." : "No results found."}
          </CommandEmpty>
          {searchResults.length > 0 && (
            <CommandGroup heading="Results">
              {searchResults.map((result) => (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  onSelect={() => {
                    router.navigate({ to: result.url });
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                >
                  {result.type === "website" && <IconGlobe size={16} className="mr-2" />}
                  {result.type === "goal" && <IconTarget size={16} className="mr-2" />}
                  {result.type === "user" && <IconUsers size={16} className="mr-2" />}
                  <div>
                    <p className="text-sm font-medium">{result.title}</p>
                    <p className="text-xs text-muted-foreground">{result.description}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Navigation">
            {getNavigationItems(session).map((item) => (
              <CommandItem
                key={item.url}
                onSelect={() => {
                  router.navigate({ to: item.url });
                  setSearchOpen(false);
                }}
              >
                <item.icon size={16} className="mr-2" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
