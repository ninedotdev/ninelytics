"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEventMessage } from "@/lib/event-formatter";
import { api } from "@/utils/trpc";
import { CountryFlag } from "@/components/ui/country-flag";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceIcon } from "@/components/ui/device-icon";

interface Website { id: string; name: string; url: string }
interface ActiveVisitor { visitorId: string; page: string; country: string; city: string; device: string; browser: string; lastSeen: string }
interface ActivePage { page: string; viewers: number }
interface LiveEvent { type: string; name: string; page: string; visitorId: string; timestamp: number; properties?: Record<string, unknown> }
interface GeoData { country: string; count: number }
interface RealtimeData { activeVisitors: number; visitors: ActiveVisitor[]; activePages: ActivePage[]; liveEvents: LiveEvent[]; geography: GeoData[]; timestamp: number }

export default function RealtimePage() {
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [displayEvents, setDisplayEvents] = useState<(LiveEvent & { _key: string })[]>([]);
  const prevEventsRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: websitesData, isLoading: loadingWebsites } = api.websites.optimized.useQuery();
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData.items : [];
    return items.map((w) => ({ id: String(w.id ?? ""), name: String(w.name ?? ""), url: String(w.url ?? "") }));
  }, [websitesData]);

  useEffect(() => {
    if (!loadingWebsites && websites.length > 0 && !selectedWebsite) {
      setSelectedWebsite(websites[0]!.id);
    }
  }, [websites.length, loadingWebsites, selectedWebsite]);

  const { data: rawData } = api.realtime.byWebsiteId.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite, refetchInterval: 5000, refetchIntervalInBackground: false }
  );

  const data: RealtimeData = (rawData as RealtimeData) ?? {
    activeVisitors: 0, visitors: [], activePages: [], liveEvents: [], geography: [], timestamp: Date.now(),
  };

  // Merge new events smoothly — detect new ones, prepend with animation key
  useEffect(() => {
    if (!data.liveEvents.length) {
      if (displayEvents.length > 0) setDisplayEvents([]);
      return;
    }

    const fingerprint = data.liveEvents.map(e => `${e.timestamp}-${e.visitorId}-${e.type}`).join("|");
    if (fingerprint === prevEventsRef.current) return;
    prevEventsRef.current = fingerprint;

    const tagged = data.liveEvents.map((e, i) => ({
      ...e,
      _key: `${e.timestamp}-${e.visitorId}-${i}`,
    }));

    setDisplayEvents(tagged);
  }, [data.liveEvents, displayEvents.length]);

  // Smooth scroll to top when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [displayEvents.length]);

  const formatRelativeTime = useCallback((timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return "now";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  }, []);

  const getEventDot = (type: string) => {
    const colors: Record<string, string> = {
      pageview: "bg-blue-500",
      engagement: "bg-emerald-500",
      performance: "bg-violet-500",
      scroll_depth: "bg-amber-500",
      rage_click: "bg-red-500",
      exit_intent: "bg-orange-500",
    };
    return colors[type] || "bg-muted-foreground";
  };

  if (loadingWebsites) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Top bar — selector + live indicator */}
        <div className="flex items-center justify-between">
          <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select website" />
            </SelectTrigger>
            <SelectContent>
              {websites.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground font-medium">Live</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <p className="text-muted-foreground text-[10px] md:text-xs font-medium uppercase tracking-wider">Visitors now</p>
              <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{data.activeVisitors}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <p className="text-muted-foreground text-[10px] md:text-xs font-medium uppercase tracking-wider">Active pages</p>
              <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{data.activePages.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <p className="text-muted-foreground text-[10px] md:text-xs font-medium uppercase tracking-wider">Countries</p>
              <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{data.geography.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 md:pt-6">
              <p className="text-muted-foreground text-[10px] md:text-xs font-medium uppercase tracking-wider">Events</p>
              <p className="text-2xl md:text-3xl font-semibold tabular-nums mt-1">{data.liveEvents.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Live Events — 3 cols */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Live Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={scrollRef} className="relative h-[300px] md:h-[420px] overflow-y-auto scroll-smooth" style={{ maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' }}>
                {displayEvents.length > 0 ? (
                  <div className="space-y-px">
                    {displayEvents.slice(0, 20).map((event, index) => {
                      return (
                        <div
                          key={event._key}
                          className="flex items-center gap-2 rounded-md px-2 py-2 min-w-0"
                        >
                          {/* Color dot */}
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getEventDot(event.type)}`} />

                          {/* Event content */}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <span className="text-sm truncate block">
                              {formatEventMessage(event.type, event.name, event.properties || {})}
                            </span>
                            <span className="text-muted-foreground text-[11px] truncate block">
                              {event.page}
                            </span>
                          </div>

                          {/* Time */}
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                            {formatRelativeTime(event.timestamp)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <p className="text-sm">Waiting for events...</p>
                    <p className="text-xs mt-1">Events appear here as they happen</p>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>

          {/* Right column — 2 cols */}
          <div className="lg:col-span-2 space-y-4">
            {/* Active Visitors */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Active Visitors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[150px] md:max-h-[200px] overflow-y-auto">
                  {data.visitors.length > 0 ? (
                    data.visitors.map((v) => (
                      <div key={v.visitorId} className="flex items-center gap-2 text-sm py-1 min-w-0">
                        <DeviceIcon device={v.device} size={14} />
                        <span className="truncate flex-1 text-foreground/90">{v.page}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {v.city !== "Unknown" ? v.city : v.country}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatRelativeTime(parseInt(v.lastSeen))}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">No active visitors</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Active Pages */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Top Pages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.activePages.length > 0 ? (
                    data.activePages.map((p) => {
                      const max = data.activePages[0]?.viewers ?? 1;
                      return (
                        <div key={p.page} className="space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                            <span className="truncate text-foreground/90 min-w-0">{p.page}</span>
                            <span className="text-muted-foreground tabular-nums font-medium">{p.viewers}</span>
                          </div>
                          <div className="bg-muted h-1 rounded-full">
                            <div
                              className="h-full rounded-full bg-primary/85 transition-all"
                              style={{ width: `${(p.viewers / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">No active pages</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Countries */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Locations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {data.geography.length > 0 ? (
                    [...data.geography]
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 6)
                      .map((geo) => (
                        <div key={geo.country} className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            <CountryFlag countryCode={geo.country} size={16} />
                            <span className="text-sm text-foreground/90">{geo.country}</span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums font-medium">{geo.count}</span>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">No location data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
