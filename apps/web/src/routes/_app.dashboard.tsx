import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
} from "@/components/ui/map";
import { IconFocus2, IconWorld } from "@tabler/icons-react";
import { trpc } from "@/lib/trpc";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { BreakdownCard } from "@/components/dashboard/breakdown-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardPage,
})

const MAP_HEIGHT = "38rem";

function DashboardMap() {
  const { data: websitesData } = trpc.websites.optimized.useQuery();
  const websites = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData.items : [];
    return items.map((w) => ({ id: String(w.id), name: String(w.name) }));
  }, [websitesData]);

  const [selectedWebsite, setSelectedWebsite] = useState<string>("all");
  const [mapMode, setMapMode] = useState<"focus" | "world">(() => {
    if (typeof window === "undefined") return "focus";
    return (localStorage.getItem("dashboard-map-mode") as "focus" | "world") || "focus";
  });

  // Single query — global or filtered by website
  const { data, isLoading } = trpc.dashboard.mapDashboard.useQuery(
    selectedWebsite !== "all" ? { websiteId: selectedWebsite } : undefined
  );

  // Device pie chart
  const devicePieData = useMemo(() => {
    if (!data?.deviceBreakdown?.length) return [];
    const total = data.deviceBreakdown.reduce((acc, d) => acc + d.count, 0);
    if (total === 0) return [];
    const chartColors = [
      "var(--color-chart-1)",
      "var(--color-chart-2)",
      "var(--color-chart-3)",
      "var(--color-chart-4)",
      "var(--color-chart-5)",
    ];
    return data.deviceBreakdown.slice(0, 3).map((d, i) => ({
      name: d.device,
      value: (d.count / total) * 100,
      fill: chartColors[i] || "var(--color-primary)",
    }));
  }, [data]);

  const changePercent = data && data.prevTotalVisitors > 0
    ? ((data.totalVisitors - data.prevTotalVisitors) / data.prevTotalVisitors) * 100
    : 0;

  const mapRef = useRef<{ flyTo: (opts: { center: [number, number]; zoom: number; duration: number }) => void } | null>(null);
  const hasFlewRef = useRef(false);

  const locations = data?.locations ?? [];

  // Auto-center on the area with most visitor concentration
  const mapView = useMemo(() => {
    if (locations.length === 0) return { center: [0, 20] as [number, number], zoom: 1.8 };

    // Weighted center — locations with more visitors pull the center toward them
    let totalWeight = 0;
    let weightedLon = 0;
    let weightedLat = 0;
    for (const loc of locations) {
      totalWeight += loc.visitors;
      weightedLon += loc.lon * loc.visitors;
      weightedLat += loc.lat * loc.visitors;
    }
    const centerLon = weightedLon / totalWeight;
    const centerLat = weightedLat / totalWeight;

    // Zoom based on spread — if all visitors are in one region, zoom in more
    let maxDist = 0;
    for (const loc of locations) {
      const dist = Math.sqrt((loc.lon - centerLon) ** 2 + (loc.lat - centerLat) ** 2);
      if (dist > maxDist) maxDist = dist;
    }

    // Subtle zoom: tight cluster → ~3, spread worldwide → ~2
    const zoom = maxDist < 5 ? 3 : maxDist < 20 ? 2.5 : maxDist < 60 ? 2.2 : 1.8;

    return { center: [centerLon, centerLat] as [number, number], zoom };
  }, [locations]);

  const toggleMapMode = useCallback(() => {
    const next = mapMode === "focus" ? "world" : "focus";
    setMapMode(next);
    localStorage.setItem("dashboard-map-mode", next);
    if (mapRef.current) {
      if (next === "world") {
        mapRef.current.flyTo({ center: [0, 20], zoom: 1.8, duration: 1200 });
      } else if (locations.length > 0) {
        mapRef.current.flyTo({ center: mapView.center, zoom: mapView.zoom, duration: 1200 });
      }
    }
  }, [mapMode, locations.length, mapView]);

  // Fly to computed center when data first loads (only in focus mode)
  useEffect(() => {
    if (mapMode === "focus" && locations.length > 0 && mapRef.current && !hasFlewRef.current) {
      hasFlewRef.current = true;
      mapRef.current.flyTo({
        center: mapView.center,
        zoom: mapView.zoom,
        duration: 1500,
      });
    }
  }, [mapMode, locations.length, mapView]);

  return (
    <div className="bg-background relative min-h-screen" style={{ "--map-height": MAP_HEIGHT } as React.CSSProperties}>
      {/* Top controls — hidden on mobile, shown on desktop */}
      <div className="absolute top-4 right-4 z-20 hidden md:flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="bg-card/70 backdrop-blur-sm h-9 w-9"
          onClick={toggleMapMode}
          title={mapMode === "focus" ? "Switch to world view" : "Focus on visitors"}
        >
          {mapMode === "focus" ? <IconWorld size={16} /> : <IconFocus2 size={16} />}
        </Button>
        {websites.length > 0 && (
          <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="bg-card/70 w-48 backdrop-blur-sm">
              <SelectValue placeholder="All websites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All websites</SelectItem>
              {websites.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="relative h-(--map-height)">
        <Map ref={mapRef as React.Ref<never>} center={[0, 20]} zoom={1.8} scrollZoom={false} renderWorldCopies={true}>
          <MapControls showFullscreen />
          {locations.map((location, i) => (
            <MapMarker
              key={`${location.city}-${location.lat}-${location.lon}`}
              longitude={location.lon}
              latitude={location.lat}
            >
              <MarkerContent>
                <div
                  className="rounded-full bg-primary/70"
                  style={{
                    width: Math.max(8, Math.min(location.visitors * 3, 40)),
                    height: Math.max(8, Math.min(location.visitors * 3, 40)),
                  }}
                />
              </MarkerContent>
              <MarkerTooltip offset={20} className="bg-background/90 backdrop-blur-md text-foreground border shadow-lg min-w-[160px]">
                <p className="font-medium text-sm">{location.city}</p>
                <p className="text-xs text-muted-foreground">{location.country}</p>
                <div className="mt-1.5 pt-1.5 border-t border-border/50">
                  <p className="text-xs tabular-nums font-medium">{location.visitors} visitor{location.visitors !== 1 ? "s" : ""}</p>
                  {location.websites && location.websites.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {location.websites.map((site: { name: string; visitors: number }) => (
                        <div key={site.name} className="flex items-center justify-between gap-4">
                          <span className="text-[11px] text-muted-foreground truncate">{site.name}</span>
                          <span className="text-[11px] tabular-nums font-medium">{site.visitors}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </MarkerTooltip>
            </MapMarker>
          ))}
        </Map>
        <div
          className="via-background/30 to-background pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent"
          aria-hidden
        />
        <OverviewCard
          totalVisitors={data?.totalVisitors ?? 0}
          changePercent={changePercent}
          dailyData={data?.dailyVisitors ?? []}
          deviceData={devicePieData}
          isLoading={isLoading}
        />
      </div>

      {/* Mobile controls */}
      <div className="flex md:hidden items-center gap-2 px-4 pt-4">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={toggleMapMode}
          title={mapMode === "focus" ? "Switch to world view" : "Focus on visitors"}
        >
          {mapMode === "focus" ? <IconWorld size={16} /> : <IconFocus2 size={16} />}
        </Button>
        {websites.length > 0 && (
          <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="All websites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All websites</SelectItem>
              {websites.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <BreakdownCard title="Top Pages" rows={data?.topPages ?? []} isLoading={isLoading} />
        <BreakdownCard title="Referrers" rows={data?.topReferrers ?? []} isLoading={isLoading} />
        <BreakdownCard title="Countries" rows={data?.topCountries ?? []} isLoading={isLoading} />
        <BreakdownCard title="Devices" rows={data?.deviceBreakdown?.map((d) => ({ label: d.device, value: d.count })) ?? []} isLoading={isLoading} />
      </div>
    </div>
  );
}

function DashboardPage() {
  return <DashboardMap />;
}
