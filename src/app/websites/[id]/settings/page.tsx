"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconGlobe, IconCopy, IconAlertTriangle, IconDeviceFloppy, IconUnlink, IconRefresh, IconExternalLink, IconSettings, IconPlug, IconShieldCheck, IconSitemap, IconCircleCheck, IconCircleX, IconGauge, IconHeartRateMonitor } from "@tabler/icons-react";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { Cloudflare } from "@/components/icons/cloudflare";
import { GoogleAnalytics } from "@/components/icons/google-analytics";
import { Google } from "@/components/icons/google";
import { Stripe } from "@/components/icons/stripe";
import { Telegram } from "@/components/icons/telegram";
import { PostHog } from "@/components/icons/posthog";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { sileo } from "sileo";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { WebsiteDeletionProgress } from "@/components/website-deletion-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/utils/trpc";

type Website = {
  id: string;
  name: string;
  url: string;
  description: string | null;
  trackingCode: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING";
  excludedPaths?: string[] | null;
  cloudflareZoneId?: string | null;
  cloudflareSyncedAt?: string | null;
  googleAnalyticsPropertyId?: string | null;
  googleAnalyticsSyncedAt?: string | null;
  searchConsoleSiteUrl?: string | null;
  searchConsoleSyncedAt?: string | null;
  stripeApiKey?: string | null;
  stripeSyncedAt?: string | null;
  posthogConfig?: string | null;
  posthogSyncedAt?: string | null;
  cookieConsent?: {
    enabled: boolean;
    position: "bottom" | "top" | "bottom-left" | "bottom-right";
    theme: "light" | "dark" | "auto";
    message: string;
    acceptText: string;
    rejectText: string;
    categories: { necessary: boolean; analytics: boolean; marketing: boolean; preferences: boolean };
    privacyPolicyUrl?: string;
  } | null;
  speedInsightsEnabled?: boolean | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

function DataCleanupCard({ websiteId }: { websiteId: string }) {
  const [period, setPeriod] = useState("30");
  const [selectedTables, setSelectedTables] = useState<string[]>(["webVitals"]);
  const [cleaning, setCleaning] = useState(false);

  const allTables = [
    { id: "pageViews", label: "Page Views" },
    { id: "events", label: "Events" },
    { id: "visitors", label: "Visitors" },
    { id: "sessions", label: "Sessions" },
    { id: "webVitals", label: "Web Vitals" },
    { id: "searchConsole", label: "Search Console" },
    { id: "performance", label: "Performance Metrics" },
  ];

  const cleanup = api.websites.cleanupData.useMutation({
    onSuccess(data) {
      const total = Object.values(data.deleted).reduce((s, n) => s + n, 0);
      sileo.success({ title: `Cleaned up ${total.toLocaleString()} records` });
      setCleaning(false);
    },
    onError(error) {
      sileo.error({ title: error.message || "Cleanup failed" });
      setCleaning(false);
    },
  });

  const toggleTable = (id: string) => {
    setSelectedTables((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Data Cleanup</CardTitle>
        <CardDescription>Delete old analytics data to free up storage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Keep only the last</Label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="180">6 months</option>
            <option value="365">1 year</option>
            <option value="0">Delete everything</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Tables to clean</Label>
          <div className="grid grid-cols-2 gap-2">
            {allTables.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTables.includes(t.id)}
                  onChange={() => toggleTable(t.id)}
                  className="rounded border-input"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        {period === "0" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={cleaning || selectedTables.length === 0}>
                {cleaning ? <><Spinner size={14} className="mr-1.5" /> Deleting...</> : <><IconAlertTriangle size={14} className="mr-1.5" /> Delete All Data</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>all</strong> data for the selected tables. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    setCleaning(true);
                    cleanup.mutate({
                      websiteId,
                      olderThanDays: 0,
                      tables: selectedTables as ("pageViews" | "events" | "visitors" | "sessions" | "webVitals" | "searchConsole" | "performance")[],
                    });
                  }}
                >
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              if (selectedTables.length === 0) return;
              setCleaning(true);
              cleanup.mutate({
                websiteId,
                olderThanDays: parseInt(period),
                tables: selectedTables as ("pageViews" | "events" | "visitors" | "sessions" | "webVitals" | "searchConsole" | "performance")[],
              });
            }}
            disabled={cleaning || selectedTables.length === 0}
          >
            {cleaning ? <><Spinner size={14} className="mr-1.5" /> Cleaning...</> : <><IconAlertTriangle size={14} className="mr-1.5" /> Clean Selected Data</>}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">This permanently deletes the selected data. Cannot be undone.</p>
      </CardContent>
    </Card>
  );
}

function NotificationPrefsCard() {
  const [prefsSaving, setPrefsSaving] = useState(false);

  const { data: prefs, refetch: refetchPrefs } = api.uptime.getNotificationPrefs.useQuery();

  const [notifyOnDown, setNotifyOnDown] = useState(true);
  const [notifyOnRecovered, setNotifyOnRecovered] = useState(true);
  const [notifyOnDegraded, setNotifyOnDegraded] = useState(false);
  const [notifyOnSslExpiry, setNotifyOnSslExpiry] = useState(true);
  const [notifyOnContentChange, setNotifyOnContentChange] = useState(false);
  const [notifyViaApp, setNotifyViaApp] = useState(true);
  const [notifyViaEmail, setNotifyViaEmail] = useState(true);
  const [notifyViaSms, setNotifyViaSms] = useState(false);
  const [notifyViaTelegram, setNotifyViaTelegram] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    if (prefs) {
      setNotifyOnDown(prefs.notifyOnDown ?? true);
      setNotifyOnRecovered(prefs.notifyOnRecovered ?? true);
      setNotifyOnDegraded(prefs.notifyOnDegraded ?? false);
      setNotifyOnSslExpiry(prefs.notifyOnSslExpiry ?? true);
      setNotifyOnContentChange(prefs.notifyOnContentChange ?? false);
      setNotifyViaApp(prefs.notifyViaApp ?? true);
      setNotifyViaEmail(prefs.notifyViaEmail ?? true);
      setNotifyViaSms(prefs.notifyViaSms ?? false);
      setNotifyViaTelegram(prefs.notifyViaTelegram ?? false);
      setPhoneNumber(prefs.phoneNumber ?? "");
    }
  }, [prefs]);

  const updatePrefs = api.uptime.updateNotificationPrefs.useMutation({
    onSuccess() {
      sileo.success({ title: "Notification preferences saved" });
      setPrefsSaving(false);
      refetchPrefs();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to save" });
      setPrefsSaving(false);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Choose what events trigger alerts and how you receive them</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Event types */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Alert Events</div>
          <div className="space-y-2">
            {[
              { label: "Site goes down", desc: "HTTP errors or timeouts", value: notifyOnDown, set: setNotifyOnDown },
              { label: "Site recovers", desc: "Back online after an incident", value: notifyOnRecovered, set: setNotifyOnRecovered },
              { label: "Slow response", desc: "Response time exceeds threshold", value: notifyOnDegraded, set: setNotifyOnDegraded },
              { label: "SSL expiring", desc: "Certificate expires within 14 days", value: notifyOnSslExpiry, set: setNotifyOnSslExpiry },
              { label: "Content changed", desc: "Unexpected page content change", value: notifyOnContentChange, set: setNotifyOnContentChange },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-1">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <Switch checked={item.value} onCheckedChange={item.set} />
              </div>
            ))}
          </div>
        </div>

        {/* Channels */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Delivery Channels</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium">In-app notifications</div>
                <div className="text-xs text-muted-foreground">Bell icon in the header</div>
              </div>
              <Switch checked={notifyViaApp} onCheckedChange={setNotifyViaApp} />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium">Email</div>
                <div className="text-xs text-muted-foreground">Alerts to your account email</div>
              </div>
              <Switch checked={notifyViaEmail} onCheckedChange={setNotifyViaEmail} />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium">SMS</div>
                <div className="text-xs text-muted-foreground">Requires phone number below</div>
              </div>
              <Switch checked={notifyViaSms} onCheckedChange={setNotifyViaSms} />
            </div>

            {notifyViaSms && (
              <div className="pl-4 space-y-2">
                <Label htmlFor="phoneNumber">Phone number</Label>
                <Input
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="text-sm max-w-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium">Telegram</div>
                <div className="text-xs text-muted-foreground">
                  {prefs?.telegramChatId
                    ? <span className="flex items-center gap-1"><IconCircleCheck size={11} className="text-green-500" /> Connected — configure in Settings → Integrations</span>
                    : "Set up in Settings → Integrations"
                  }
                </div>
              </div>
              <Switch
                checked={notifyViaTelegram}
                onCheckedChange={setNotifyViaTelegram}
                disabled={!prefs?.telegramChatId}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={() => {
              setPrefsSaving(true);
              updatePrefs.mutate({
                notifyOnDown,
                notifyOnRecovered,
                notifyOnDegraded,
                notifyOnSslExpiry,
                notifyOnContentChange,
                notifyViaApp,
                notifyViaEmail,
                notifyViaSms,
                notifyViaTelegram,
                phoneNumber: phoneNumber || undefined,
              });
            }}
            disabled={prefsSaving}
          >
            {prefsSaving ? <><Spinner size={14} className="mr-1.5" /> Saving...</> : <><IconDeviceFloppy size={14} className="mr-1.5" /> Save Preferences</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WebsiteSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const websiteId = params.id as string;

  const VALID_TABS = ["general", "consent", "integrations", "indexing", "uptime"] as const;
  type Tab = typeof VALID_TABS[number];
  const activeTab = (VALID_TABS.includes(searchParams.get("tab") as Tab)
    ? searchParams.get("tab")
    : "general") as Tab;

  const setTab = (tab: Tab) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const normalizeExcluded = (value: unknown): string[] | null => {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === "string");
    }
    return null;
  };

  const [website, setWebsite] = useState<Website | null>(null);
  const { data, isLoading } = api.websites.byId.useQuery({ id: websiteId });
  const utils = api.useUtils();
  const updateWebsite = api.websites.update.useMutation({
    onSuccess(updated) {
      setWebsite({
        ...updated,
        excludedPaths: normalizeExcluded(updated.excludedPaths),
      });
      setName(updated.name);
      setUrl(updated.url);
      setDescription(updated.description || "");
      setStatus(updated.status);
      setExcludedPaths(
        normalizeExcluded(updated.excludedPaths)?.join("\n") ?? ""
      );
      sileo.success({ title: "Website updated successfully" });
      utils.websites.optimized.invalidate();
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to update website" });
    },
    onSettled() {
      setSaving(false);
    },
  });
  const [saving, setSaving] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Website["status"] | "">("");
  const [excludedPaths, setExcludedPaths] = useState<string>("");

  // Analytics consent state
  type ConsentConfig = NonNullable<Website["cookieConsent"]> & { privacyPolicyUrl: string };
  const defaultConsent: ConsentConfig = {
    enabled: false,
    position: "bottom",
    theme: "auto",
    message: "We use analytics to understand site usage and improve your experience.",
    acceptText: "Accept All",
    rejectText: "Reject",
    categories: { necessary: true as const, analytics: true, marketing: false, preferences: false },
    privacyPolicyUrl: "",
  };
  const [cookieConsent, setCookieConsent] = useState<ConsentConfig>(defaultConsent);

  // Cloudflare integration state
  const [cfSyncing, setCfSyncing] = useState(false);

  const { data: cfZones } = api.cloudflare.listZones.useQuery(
    undefined,
    { enabled: !!data }
  );

  const linkCloudflareZone = api.cloudflare.linkZone.useMutation({
    onSuccess() {
      sileo.success({ title: "Zone linked" });
      utils.websites.byId.invalidate({ id: websiteId });
      utils.websites.optimized.invalidate();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to link zone" });
    },
  });

  const unlinkCloudflare = api.cloudflare.unlink.useMutation({
    onSuccess() {
      sileo.success({ title: "Zone unlinked" });
      utils.websites.byId.invalidate({ id: websiteId });
      utils.websites.optimized.invalidate();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to unlink" });
    },
  });

  const syncCloudflare = api.cloudflare.sync.useMutation({
    onSuccess(result) {
      utils.websites.byId.invalidate({ id: websiteId });
      utils.websites.optimized.invalidate();
      setCfSyncing(false);
    },
    onError() {
      setCfSyncing(false);
    },
  });

  // Google Analytics
  const { data: gaProperties } = api.googleAnalytics.listProperties.useQuery(
    undefined,
    { enabled: !!data }
  );

  const [gaSyncing, setGaSyncing] = useState(false);

  const linkGAProperty = api.googleAnalytics.linkProperty.useMutation({
    onSuccess() {
      sileo.success({ title: "GA4 property linked" });
      utils.websites.byId.invalidate({ id: websiteId });
      utils.websites.optimized.invalidate();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to link property" });
    },
  });

  const unlinkGA = api.googleAnalytics.unlink.useMutation({
    onSuccess() {
      sileo.success({ title: "GA4 property unlinked" });
      utils.websites.byId.invalidate({ id: websiteId });
      utils.websites.optimized.invalidate();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to unlink" });
    },
  });

  const syncGA = api.googleAnalytics.sync.useMutation({
    onSuccess() {
      utils.websites.byId.invalidate({ id: websiteId });
      utils.websites.optimized.invalidate();
      setGaSyncing(false);
    },
    onError() {
      setGaSyncing(false);
    },
  });

  // Search Console
  const { data: scSites } = api.searchConsole.listSites.useQuery(
    undefined,
    { enabled: !!data }
  );
  const [scSyncing, setScSyncing] = useState(false);

  const linkSC = api.searchConsole.linkSite.useMutation({
    onSuccess() {
      sileo.success({ title: "Search Console site linked" });
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to link site" });
    },
  });

  const unlinkSC = api.searchConsole.unlink.useMutation({
    onSuccess() {
      sileo.success({ title: "Search Console unlinked" });
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to unlink" });
    },
  });

  const syncSC = api.searchConsole.sync.useMutation({
    onSuccess() {
      utils.websites.byId.invalidate({ id: websiteId });
      setScSyncing(false);
    },
    onError() {
      setScSyncing(false);
    },
  });

  // Stripe
  const [stripeKey, setStripeKey] = useState("");
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeSyncing, setStripeSyncing] = useState(false);

  const connectStripe = api.stripe.connect.useMutation({
    onSuccess(data) {
      sileo.success({ title: `Stripe connected: ${data.displayName}` });
      setStripeKey("");
      setStripeSaving(false);
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Invalid Stripe key" });
      setStripeSaving(false);
    },
  });

  const disconnectStripe = api.stripe.disconnect.useMutation({
    onSuccess() {
      sileo.success({ title: "Stripe disconnected" });
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to disconnect" });
    },
  });

  const syncStripe = api.stripe.sync.useMutation({
    onSuccess() {
      utils.websites.byId.invalidate({ id: websiteId });
      setStripeSyncing(false);
    },
    onError() {
      setStripeSyncing(false);
    },
  });

  // PostHog
  const [phHost, setPhHost] = useState("https://us.posthog.com");
  const [phProjectId, setPhProjectId] = useState("");
  const [phApiKey, setPhApiKey] = useState("");
  const [phSaving, setPhSaving] = useState(false);
  const [phSyncing, setPhSyncing] = useState(false);

  const connectPostHog = api.posthog.connect.useMutation({
    onSuccess() {
      sileo.success({ title: "PostHog connected" });
      setPhHost("https://us.posthog.com");
      setPhProjectId("");
      setPhApiKey("");
      setPhSaving(false);
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to connect PostHog" });
      setPhSaving(false);
    },
  });

  const disconnectPostHog = api.posthog.disconnect.useMutation({
    onSuccess() {
      sileo.success({ title: "PostHog disconnected" });
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to disconnect" });
    },
  });

  const syncPostHog = api.posthog.sync.useMutation({
    onSuccess() {
      utils.websites.byId.invalidate({ id: websiteId });
      setPhSyncing(false);
    },
    onError() {
      setPhSyncing(false);
    },
  });

  // Sitemap / Indexing
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [autoIndexEnabled, setAutoIndexEnabled] = useState(false);
  const [indexNowEnabled, setIndexNowEnabled] = useState(false);
  const [sitemapSaving, setSitemapSaving] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; key: string } | null>(null);
  const [indexTriggering, setIndexTriggering] = useState(false);
  const [nextSubmitIn, setNextSubmitIn] = useState<string | null>(null);

  const { data: sitemapSettings, refetch: refetchSitemap } = api.sitemap.getSettings.useQuery(
    { websiteId },
    {
      enabled: !!data,
      // Auto-refresh every 30s while workflow is active (pending or errors being retried)
      refetchInterval: (query) => {
        const stats = query.state.data?.stats;
        const lastSubmit = query.state.data?.lastGoogleSubmitAt;
        const recentSubmit = lastSubmit
          ? Date.now() - new Date(lastSubmit).getTime() < 15 * 60 * 1000
          : false;
        const active = stats && (stats.pending > 0 || stats.googleError > 0 || recentSubmit);
        return active ? 30_000 : false;
      },
    }
  );

  useEffect(() => {
    if (!sitemapSettings?.lastGoogleSubmitAt || !sitemapSettings.stats.pending) {
      setNextSubmitIn(null);
      return;
    }
    const INTERVAL_MS = 8 * 60 * 1000;
    const update = () => {
      const last = new Date(sitemapSettings.lastGoogleSubmitAt!).getTime();
      const nextAt = last + INTERVAL_MS;
      const diff = nextAt - Date.now();
      // Only show if genuinely within the 8m window
      if (diff <= 0) {
        setNextSubmitIn("any moment...");
      } else if (diff > INTERVAL_MS) {
        // Stale timestamp — workflow not actively running
        setNextSubmitIn(null);
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setNextSubmitIn(`${m}m ${s}s`);
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sitemapSettings?.lastGoogleSubmitAt, sitemapSettings?.stats.pending]);

  useEffect(() => {
    if (sitemapSettings) {
      setSitemapUrl(sitemapSettings.sitemapUrl ?? "");
      setAutoIndexEnabled(sitemapSettings.autoIndexEnabled ?? false);
      setIndexNowEnabled(sitemapSettings.indexNowEnabled ?? false);
    }
  }, [sitemapSettings]);

  const updateSitemapSettings = api.sitemap.updateSettings.useMutation({
    onSuccess() {
      sileo.success({ title: "Indexing settings saved" });
      setSitemapSaving(false);
      refetchSitemap();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to save settings" });
      setSitemapSaving(false);
    },
  });

  const verifyIndexNowKey = api.sitemap.verifyIndexNowKey.useMutation({
    onSuccess(result) {
      setVerifyResult(result);
    },
    onError(error) {
      sileo.error({ title: error.message || "Verification failed" });
    },
  });

  const triggerSitemapCheck = api.sitemap.triggerCheck.useMutation({
    onSuccess() {
      sileo.success({ title: "Check started", description: "Workflow running in the background" });
      setIndexTriggering(false);
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to trigger check" });
      setIndexTriggering(false);
    },
  });

  const toggleSpeedInsights = api.speedInsights.toggle.useMutation({
    onSuccess(_, variables) {
      sileo.success({ title: variables.enabled ? "Speed Insights enabled" : "Speed Insights disabled" });
      utils.websites.byId.invalidate({ id: websiteId });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to update Speed Insights" });
    },
  });

  // ─── Uptime state ───
  const [uptimeEnabled, setUptimeEnabled] = useState(false);
  const [uptimeKeyword, setUptimeKeyword] = useState("");
  const [uptimeInterval, setUptimeInterval] = useState("5");
  const [uptimeSaving, setUptimeSaving] = useState(false);

  const { data: uptimeSettings, refetch: refetchUptime } = api.uptime.getSettings.useQuery(
    { websiteId },
    { enabled: !!websiteId }
  );

  useEffect(() => {
    if (uptimeSettings) {
      setUptimeEnabled(uptimeSettings.uptimeEnabled ?? false);
      setUptimeKeyword(uptimeSettings.uptimeKeyword ?? "");
      setUptimeInterval(String(uptimeSettings.uptimeInterval ?? 5));
    }
  }, [uptimeSettings]);

  const updateUptimeSettings = api.uptime.updateSettings.useMutation({
    onSuccess() {
      sileo.success({ title: "Uptime settings saved" });
      setUptimeSaving(false);
      refetchUptime();
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to save settings" });
      setUptimeSaving(false);
    },
  });

  const triggerUptimeCheck = api.uptime.triggerCheck.useMutation({
    onSuccess() {
      sileo.success({ title: "Check triggered" });
      setTimeout(() => refetchUptime(), 5000);
    },
  });

  const resetUptimeBaseline = api.uptime.resetContentBaseline.useMutation({
    onSuccess() {
      sileo.success({ title: "Content baseline reset" });
      refetchUptime();
    },
  });

  useEffect(() => {
    if (data) {
      setWebsite({
        ...data,
        excludedPaths: normalizeExcluded(data.excludedPaths),
      });
      setName(data.name);
      setUrl(data.url);
      setDescription(data.description || "");
      setStatus(data.status);
      setExcludedPaths(
        normalizeExcluded(data.excludedPaths)?.join("\n") ?? ""
      );
      if (data.cookieConsent) {
        setCookieConsent({ ...defaultConsent, ...data.cookieConsent });
      }
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Parse excluded paths from textarea (one per line)
      const pathsArray = excludedPaths
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      updateWebsite.mutate({
        id: websiteId,
        data: {
          name,
          url,
          description,
          status: status || undefined,
          excludedPaths: pathsArray.length > 0 ? pathsArray : null,
          cookieConsent: cookieConsent.enabled ? { ...cookieConsent, categories: { ...cookieConsent.categories, necessary: true as const } } : null,
        },
      });
    } catch (error) {
      console.error("Error updating website:", error);
      sileo.error({ title: "Error updating website" });
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeletionDialog(true);
  };

  const handleDeletionComplete = () => {
    sileo.success({ title: "Website deleted successfully" });
    router.push("/websites");
  };

  const handleDeletionCancel = () => {
    setShowDeletionDialog(false);
  };

  const copyTrackingCode = () => {
    if (website) {
      navigator.clipboard.writeText(website.trackingCode);
      sileo.success({ title: "Tracking code copied to clipboard!" });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-9 w-32" />
          <div className="space-y-1">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
              <div className="flex justify-end">
                <Skeleton className="h-9 w-28" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-40" />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-40" />
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!website) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <IconGlobe size={48} className="text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Website not found
          </h3>
          <Button asChild>
            <Link href="/websites">Back to Websites</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/websites/${websiteId}`}>
              <IconArrowLeft size={16} className="mr-2" />
              Back to Details
            </Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setTab(v as Tab)}>
          <div className="flex justify-center">
          <TabsList>
            <TabsTab value="general" className="gap-1.5">
              <IconSettings size={14} />
              General
            </TabsTab>
            <TabsTab value="consent" className="gap-1.5">
              <IconShieldCheck size={14} />
              Consent
            </TabsTab>
            <TabsTab value="integrations" className="gap-1.5">
              <IconPlug size={14} />
              Integrations
            </TabsTab>
            <TabsTab value="indexing" className="gap-1.5">
              <IconSitemap size={14} />
              Indexing
            </TabsTab>
            <TabsTab value="uptime" className="gap-1.5">
              <IconHeartRateMonitor size={14} />
              Uptime
            </TabsTab>
          </TabsList>
          </div>

          {/* ─── General Tab ─── */}
          <TabsPanel value="general" className="space-y-6">

        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>
              Basic information about your website
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Website Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Website"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">Website URL</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of your website..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="excludedPaths">Excluded Paths (Optional)</Label>
              <Textarea
                id="excludedPaths"
                value={excludedPaths}
                onChange={(e) => setExcludedPaths(e.target.value)}
                placeholder="/admin&#10;/dashboard/*&#10;/api/*"
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter path patterns to exclude from tracking (one per line).
                Supports wildcards (*). Example: /admin, /dashboard/*,
                /internal/*
              </p>
              {/* Recommended presets */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1.5">Recommended exclusions (non-user traffic):</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "/_next/*",
                    "/api/*",
                    "/robots.txt",
                    "/favicon.ico",
                    "/sitemap*.xml",
                    "/__manifest",
                    "/cdn-cgi/*",
                    "/.well-known/*",
                    "/sw.js",
                    "/workbox-*",
                    "/ads.txt",
                  ].map((preset) => {
                    const currentPaths = excludedPaths.split("\n").map((p) => p.trim()).filter(Boolean);
                    const alreadyAdded = currentPaths.some((p) => p === preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => {
                          const paths = excludedPaths.trim();
                          setExcludedPaths(paths ? `${paths}\n${preset}` : preset);
                        }}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                          alreadyAdded
                            ? "border-primary/20 bg-primary/5 text-primary cursor-default"
                            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                        }`}
                      >
                        {alreadyAdded && <IconCircleCheck size={11} className="shrink-0" />}
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as Website["status"])}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Inactive websites will not collect analytics data
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <IconDeviceFloppy size={16} className="mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tracking Code */}
        <Card>
          <CardHeader>
            <CardTitle>Tracking Code</CardTitle>
            <CardDescription>
              Add this code to your website to start tracking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{website.trackingCode}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={copyTrackingCode}
              >
                <IconCopy size={16} className="mr-2" />
                Copy
              </Button>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 text-sm">
                Installation Instructions:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>Copy the tracking code above</li>
                <li>Paste it in the &lt;head&gt; section of your website</li>
                <li>Deploy your changes</li>
                <li>Analytics data will start appearing immediately</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Website Info */}
        <Card>
          <CardHeader>
            <CardTitle>Website Information</CardTitle>
            <CardDescription>
              Additional details about this website
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Website ID:</span>
              <span className="font-mono">{website.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDate(website.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

          {/* Speed Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconGauge size={18} />
                Speed Insights
              </CardTitle>
              <CardDescription>
                Collect Core Web Vitals (LCP, FCP, INP, CLS, TTFB) from real user sessions. Zero performance impact — uses native browser APIs with no extra libraries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Enable Speed Insights</p>
                  <p className="text-xs text-muted-foreground">
                    {website.speedInsightsEnabled
                      ? "Collecting Web Vitals from your visitors"
                      : "Disabled — no vitals data is being collected"}
                  </p>
                </div>
                <Switch
                  checked={website.speedInsightsEnabled ?? false}
                  onCheckedChange={(enabled) =>
                    toggleSpeedInsights.mutate({ websiteId, enabled })
                  }
                  disabled={toggleSpeedInsights.isPending}
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Cleanup */}
          <DataCleanupCard websiteId={websiteId} />

          {/* Danger Zone */}
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader>
              <CardTitle className="text-red-600 dark:text-red-400">
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-red-600 dark:text-red-400 mb-1">
                    Delete this website
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Once you delete a website, there is no going back. All analytics
                    data will be permanently deleted.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <IconAlertTriangle size={16} className="mr-2" />
                      Delete Website
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{website.name}&quot; and all
                        associated analytics data. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete Website
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>

          </TabsPanel>

          {/* ─── Consent Tab ─── */}
          <TabsPanel value="consent" className="space-y-6">

        {/* Analytics Consent */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">Analytics Consent</CardTitle>
                <CardDescription>
                  Show an analytics consent banner on your website
                </CardDescription>
              </div>
              <Switch
                checked={cookieConsent.enabled}
                onCheckedChange={(checked) => setCookieConsent({ ...cookieConsent, enabled: checked })}
              />
            </div>
          </CardHeader>
          {cookieConsent.enabled && (
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select value={cookieConsent.position} onValueChange={(v) => setCookieConsent({ ...cookieConsent, position: v as typeof cookieConsent.position })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottom">Bottom bar</SelectItem>
                      <SelectItem value="top">Top bar</SelectItem>
                      <SelectItem value="bottom-left">Bottom left</SelectItem>
                      <SelectItem value="bottom-right">Bottom right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select value={cookieConsent.theme} onValueChange={(v) => setCookieConsent({ ...cookieConsent, theme: v as typeof cookieConsent.theme })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (system)</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={cookieConsent.message}
                  onChange={(e) => setCookieConsent({ ...cookieConsent, message: e.target.value })}
                  rows={2}
                  className="text-sm"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Accept button text</Label>
                  <Input
                    value={cookieConsent.acceptText}
                    onChange={(e) => setCookieConsent({ ...cookieConsent, acceptText: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reject button text</Label>
                  <Input
                    value={cookieConsent.rejectText}
                    onChange={(e) => setCookieConsent({ ...cookieConsent, rejectText: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Privacy Policy URL</Label>
                <Input
                  value={cookieConsent.privacyPolicyUrl || ""}
                  onChange={(e) => setCookieConsent({ ...cookieConsent, privacyPolicyUrl: e.target.value })}
                  placeholder="https://example.com/privacy"
                />
              </div>

              <div className="space-y-2">
                <Label>Categories</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked disabled className="accent-primary" /> Necessary (always on)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cookieConsent.categories.analytics}
                      onChange={(e) => setCookieConsent({ ...cookieConsent, categories: { ...cookieConsent.categories, analytics: e.target.checked } })}
                      className="accent-primary"
                    /> Analytics
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cookieConsent.categories.marketing}
                      onChange={(e) => setCookieConsent({ ...cookieConsent, categories: { ...cookieConsent.categories, marketing: e.target.checked } })}
                      className="accent-primary"
                    /> Marketing
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cookieConsent.categories.preferences}
                      onChange={(e) => setCookieConsent({ ...cookieConsent, categories: { ...cookieConsent.categories, preferences: e.target.checked } })}
                      className="accent-primary"
                    /> Preferences
                  </label>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Save to apply. The banner will appear on your website for new visitors who haven&apos;t consented yet.
              </p>
            </CardContent>
          )}
        </Card>

          </TabsPanel>

          {/* ─── Integrations Tab ─── */}
          <TabsPanel value="integrations" className="space-y-6">

        <div className="divide-y divide-border rounded-lg border">

          {/* ── Cloudflare row ── */}
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <Cloudflare className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Cloudflare Analytics</div>
                {website.cloudflareZoneId ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="truncate">{cfZones?.zones.find(z => z.id === website.cloudflareZoneId)?.name ?? website.cloudflareZoneId}</span>
                    {website.cloudflareSyncedAt && (
                      <span>&middot; Synced {formatDate(website.cloudflareSyncedAt)}</span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Import historical analytics data (up to 365 days)</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {website.cloudflareZoneId ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCfSyncing(true);
                      sileo.promise(syncCloudflare.mutateAsync({ websiteId }), {
                        loading: { title: "Syncing Cloudflare...", description: "Fetching analytics from your zone" },
                        success: (data) => ({
                          title: `Synced ${data.syncedDays} days`,
                          description: `${data.totalPageViews.toLocaleString()} pageviews · ${data.totalVisitors.toLocaleString()} visitors`,
                          icon: <Cloudflare width={18} height={18} />,
                        }),
                        error: (err) => ({
                          title: "Sync failed",
                          description: (err as Error).message || "Could not fetch Cloudflare data",
                        }),
                        action: (data) => ({
                          title: "Sync Complete",
                          description: (
                            <div className="flex flex-col items-center gap-3 text-xs pt-1">
                              <Cloudflare width={32} height={32} />
                              {data.dateRange && (
                                <div className="flex items-center gap-2 w-full">
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.from}</span>
                                  <div className="flex-1 relative h-4 flex items-center">
                                    <svg viewBox="0 0 100 20" className="w-full h-4 overflow-visible">
                                      <path d="M5 15 Q50 -5 95 15" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                                      <circle cx="5" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                      <circle cx="95" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                    </svg>
                                  </div>
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.to}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full">
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalPageViews.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Page Views</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalVisitors.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Visitors</div>
                                </div>
                              </div>
                              {(data.topCountries.length > 0 || data.topDevices.length > 0 || data.topBrowsers.length > 0) && (
                                <div className="w-full border-t border-current/10 pt-2 flex flex-col gap-1">
                                  {data.topCountries.length > 0 && (
                                    <div className="flex justify-between"><span className="opacity-50">Countries</span><span className="font-medium">{data.topCountries.join(", ")}</span></div>
                                  )}
                                  {data.topDevices.length > 0 && (
                                    <div className="flex justify-between"><span className="opacity-50">Devices</span><span className="font-medium">{data.topDevices.join(", ")}</span></div>
                                  )}
                                  {data.topBrowsers.length > 0 && (
                                    <div className="flex justify-between"><span className="opacity-50">Browsers</span><span className="font-medium">{data.topBrowsers.join(", ")}</span></div>
                                  )}
                                </div>
                              )}
                            </div>
                          ),
                        }),
                      });
                    }}
                    disabled={cfSyncing}
                  >
                    {cfSyncing ? <><Spinner size={14} className="mr-2" /> Syncing...</> : "Sync Now"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => unlinkCloudflare.mutate({ websiteId })}
                    disabled={unlinkCloudflare.isPending}
                  >
                    <IconUnlink size={16} className="mr-2" />
                    Unlink
                  </Button>
                </>
              ) : !cfZones?.hasToken ? (
                <Link href="/settings">
                  <Button variant="outline" size="sm">
                    <IconExternalLink size={16} className="mr-2" />
                    Connect
                  </Button>
                </Link>
              ) : (
                <Select onValueChange={(v) => linkCloudflareZone.mutate({ websiteId, zoneId: v })}>
                  <SelectTrigger className="w-56 h-8 text-xs">
                    <SelectValue placeholder="Select zone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(cfZones?.zones ?? []).map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* ── Google Analytics row ── */}
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <GoogleAnalytics className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Google Analytics</div>
                {website?.googleAnalyticsPropertyId ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="truncate">{website.googleAnalyticsPropertyId}</span>
                    {website.googleAnalyticsSyncedAt && (
                      <span>&middot; Synced {formatDate(website.googleAnalyticsSyncedAt)}</span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Import historical data from GA4</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {website?.googleAnalyticsPropertyId ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setGaSyncing(true);
                      sileo.promise(syncGA.mutateAsync({ websiteId }), {
                        loading: { title: "Syncing Google Analytics...", description: "Fetching property data" },
                        success: (data) => ({
                          title: `Synced ${data.syncedDays} days`,
                          description: `${data.totalPageViews.toLocaleString()} pageviews · ${data.totalVisitors.toLocaleString()} visitors`,
                          icon: <GoogleAnalytics width={18} height={18} />,
                        }),
                        error: (err) => ({
                          title: "Sync failed",
                          description: (err as Error).message || "Could not fetch GA data",
                        }),
                        action: (data) => ({
                          title: "Sync Complete",
                          description: (
                            <div className="flex flex-col items-center gap-3 text-xs pt-1">
                              <GoogleAnalytics width={32} height={32} />
                              {data.dateRange && (
                                <div className="flex items-center gap-2 w-full">
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.from}</span>
                                  <div className="flex-1 relative h-4 flex items-center">
                                    <svg viewBox="0 0 100 20" className="w-full h-4 overflow-visible">
                                      <path d="M5 15 Q50 -5 95 15" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                                      <circle cx="5" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                      <circle cx="95" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                    </svg>
                                  </div>
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.to}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full">
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalPageViews.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Page Views</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalVisitors.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Visitors</div>
                                </div>
                              </div>
                            </div>
                          ),
                        }),
                      });
                    }}
                    disabled={gaSyncing}
                  >
                    {gaSyncing ? <><Spinner size={14} className="mr-2" /> Syncing...</> : "Sync Now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => unlinkGA.mutate({ websiteId })}
                    disabled={unlinkGA.isPending}
                  >
                    Unlink
                  </Button>
                </>
              ) : !gaProperties?.hasCredentials ? (
                <Link href="/settings">
                  <Button variant="outline" size="sm">Connect</Button>
                </Link>
              ) : (
                <Select onValueChange={(v) => linkGAProperty.mutate({ websiteId, propertyId: v })}>
                  <SelectTrigger className="w-56 h-8 text-xs">
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(gaProperties?.properties ?? []).map((prop) => (
                      <SelectItem key={prop.name} value={prop.name}>{prop.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* ── Search Console row ── */}
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <Google className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Search Console</div>
                {website?.searchConsoleSiteUrl ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="truncate">{website.searchConsoleSiteUrl}</span>
                    {website.searchConsoleSyncedAt && (
                      <span>&middot; Synced {formatDate(website.searchConsoleSyncedAt)}</span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Import search performance data (queries, impressions, CTR)</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {website?.searchConsoleSiteUrl ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setScSyncing(true);
                      sileo.promise(syncSC.mutateAsync({ websiteId }), {
                        loading: { title: "Syncing Search Console...", description: "Fetching search performance data" },
                        success: (data) => ({
                          title: `Synced ${data.syncedRows} rows`,
                          description: `${data.totalClicks.toLocaleString()} clicks · ${data.totalImpressions.toLocaleString()} impressions`,
                          icon: <Google width={18} height={18} />,
                        }),
                        error: (err) => ({
                          title: "Sync failed",
                          description: (err as Error).message || "Could not fetch Search Console data",
                        }),
                        action: (data) => ({
                          title: "Sync Complete",
                          description: (
                            <div className="flex flex-col items-center gap-3 text-xs pt-1">
                              <Google width={32} height={32} />
                              {data.dateRange && (
                                <div className="flex items-center gap-2 w-full">
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.from}</span>
                                  <div className="flex-1 relative h-4 flex items-center">
                                    <svg viewBox="0 0 100 20" className="w-full h-4 overflow-visible">
                                      <path d="M5 15 Q50 -5 95 15" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                                      <circle cx="5" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                      <circle cx="95" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                    </svg>
                                  </div>
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.to}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full">
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalClicks.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Clicks</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalImpressions.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Impressions</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.uniqueQueries.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Queries</div>
                                </div>
                              </div>
                            </div>
                          ),
                        }),
                      });
                    }}
                    disabled={scSyncing}
                  >
                    {scSyncing ? <><Spinner size={14} className="mr-2" /> Syncing...</> : "Sync Now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => unlinkSC.mutate({ websiteId })}
                    disabled={unlinkSC.isPending}
                  >
                    Unlink
                  </Button>
                </>
              ) : !scSites?.hasOAuth ? (
                <Link href="/settings">
                  <Button variant="outline" size="sm">Connect</Button>
                </Link>
              ) : (
                <Select onValueChange={(v) => linkSC.mutate({ websiteId, siteUrl: v })}>
                  <SelectTrigger className="w-56 h-8 text-xs">
                    <SelectValue placeholder="Select site..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(scSites?.sites ?? []).map((site) => (
                      <SelectItem key={site.siteUrl} value={site.siteUrl}>{site.siteUrl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* ── Stripe row ── */}
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <Stripe className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Stripe</div>
                {website?.stripeApiKey ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span>••••{website.stripeApiKey.slice(-8)}</span>
                    {website.stripeSyncedAt && (
                      <span>&middot; Synced {formatDate(website.stripeSyncedAt)}</span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Import revenue data to correlate with analytics</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {website?.stripeApiKey ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setStripeSyncing(true);
                      sileo.promise(syncStripe.mutateAsync({ websiteId }), {
                        loading: { title: "Syncing Stripe...", description: "Fetching revenue data" },
                        success: (data) => ({
                          title: `Synced ${data.syncedDays} days`,
                          description: `${(data.totalRevenue / 100).toLocaleString("en-US", { style: "currency", currency: data.currency })} revenue · ${data.totalCharges} charges`,
                          icon: <Stripe width={18} height={18} />,
                        }),
                        error: (err) => ({
                          title: "Sync failed",
                          description: (err as Error).message || "Could not fetch Stripe data",
                        }),
                        action: (data) => ({
                          title: "Sync Complete",
                          description: (
                            <div className="flex flex-col items-center gap-3 text-xs pt-1">
                              <Stripe width={40} height={18} />
                              {data.dateRange && (
                                <div className="flex items-center gap-2 w-full">
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.from}</span>
                                  <div className="flex-1 relative h-4 flex items-center">
                                    <svg viewBox="0 0 100 20" className="w-full h-4 overflow-visible">
                                      <path d="M5 15 Q50 -5 95 15" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                                      <circle cx="5" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                      <circle cx="95" cy="15" r="3" fill="currentColor" opacity="0.5" />
                                    </svg>
                                  </div>
                                  <span className="font-semibold text-[11px] tracking-wide">{data.dateRange.to}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full">
                                <div className="text-center">
                                  <div className="text-sm font-bold">{(data.totalRevenue / 100).toLocaleString("en-US", { style: "currency", currency: data.currency })}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Revenue</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalCharges.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Charges</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm font-bold">{data.totalNewCustomers.toLocaleString()}</div>
                                  <div className="opacity-50 text-[10px] uppercase tracking-wider">Customers</div>
                                </div>
                              </div>
                            </div>
                          ),
                        }),
                      });
                    }}
                    disabled={stripeSyncing}
                  >
                    {stripeSyncing ? <><Spinner size={14} className="mr-2" /> Syncing...</> : "Sync Now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => disconnectStripe.mutate({ websiteId })}
                    disabled={disconnectStripe.isPending}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={stripeKey}
                    onChange={(e) => setStripeKey(e.target.value)}
                    placeholder="rk_live_..."
                    type="password"
                    className="font-mono text-xs w-44 h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!stripeKey.trim()) return;
                      setStripeSaving(true);
                      connectStripe.mutate({ websiteId, apiKey: stripeKey.trim() });
                    }}
                    disabled={stripeSaving || !stripeKey.trim()}
                  >
                    {stripeSaving ? (
                      <><Spinner size={14} className="mr-2" /> Validating...</>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* PostHog */}
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <PostHog className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">PostHog</div>
                {website?.posthogConfig ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {(() => { try { const c = JSON.parse(website.posthogConfig as string); return `${new URL(c.host).hostname} · Project ${c.projectId}`; } catch { return "Connected"; } })()}
                    {website.posthogSyncedAt && <> · Synced {formatDate(website.posthogSyncedAt)}</>}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Import analytics data from PostHog</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {website?.posthogConfig ? (
                <>
                  <Button size="sm" onClick={() => {
                    setPhSyncing(true);
                    sileo.promise(syncPostHog.mutateAsync({ websiteId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }), {
                      loading: { title: "Syncing PostHog...", description: "Fetching analytics data" },
                      success: (data) => ({
                        title: `Synced ${data.syncedDays} days`,
                        description: `${data.totalPageViews.toLocaleString()} pageviews · ${data.totalVisitors.toLocaleString()} visitors`,
                        icon: <PostHog width={18} height={18} />,
                      }),
                      error: (err) => ({ title: "Sync failed", description: (err as Error).message }),
                      action: (data) => ({
                        title: "Sync Complete",
                        description: (
                          <div className="flex flex-col items-center gap-3 text-xs pt-1">
                            <PostHog width={32} height={18} />
                            {data.dateRange && (
                              <div className="flex items-center gap-2 w-full">
                                <span className="font-semibold text-[11px]">{data.dateRange.from}</span>
                                <div className="flex-1 h-4 flex items-center">
                                  <svg viewBox="0 0 100 20" className="w-full h-4 overflow-visible">
                                    <path d="M5 15 Q50 -5 95 15" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
                                  </svg>
                                </div>
                                <span className="font-semibold text-[11px]">{data.dateRange.to}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-x-6 w-full">
                              <div className="text-center">
                                <div className="text-sm font-bold">{data.totalPageViews.toLocaleString()}</div>
                                <div className="opacity-50 text-[10px] uppercase">Page Views</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm font-bold">{data.totalVisitors.toLocaleString()}</div>
                                <div className="opacity-50 text-[10px] uppercase">Visitors</div>
                              </div>
                            </div>
                          </div>
                        ),
                      }),
                    });
                  }} disabled={phSyncing}>
                    {phSyncing ? <Spinner size={14} /> : "Sync Now"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => disconnectPostHog.mutate({ websiteId })} disabled={disconnectPostHog.isPending}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Input value={phHost} onChange={(e) => setPhHost(e.target.value)} placeholder="https://us.posthog.com" className="w-40 h-8 text-xs" />
                  <Input value={phProjectId} onChange={(e) => setPhProjectId(e.target.value)} placeholder="Project ID" className="w-24 h-8 text-xs" />
                  <Input value={phApiKey} onChange={(e) => setPhApiKey(e.target.value)} placeholder="phx_..." type="password" className="w-32 h-8 font-mono text-xs" />
                  <Button size="sm" onClick={() => {
                    if (!phHost.trim() || !phProjectId.trim() || !phApiKey.trim()) return;
                    setPhSaving(true);
                    connectPostHog.mutate({ websiteId, host: phHost.trim(), projectId: phProjectId.trim(), apiKey: phApiKey.trim() });
                  }} disabled={phSaving || !phHost.trim() || !phProjectId.trim() || !phApiKey.trim()}>
                    {phSaving ? <Spinner size={14} /> : "Connect"}
                  </Button>
                </div>
              )}
            </div>
          </div>

        </div>

          </TabsPanel>

          {/* ─── Indexing Tab ─── */}
          <TabsPanel value="indexing" className="space-y-6">

            {/* Sitemap Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Sitemap Configuration</CardTitle>
                <CardDescription>
                  Automatically discover and submit new pages to search engines
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sitemapUrl">Sitemap URL</Label>
                  <Input
                    id="sitemapUrl"
                    value={sitemapUrl}
                    onChange={(e) => setSitemapUrl(e.target.value)}
                    placeholder="https://example.com/sitemap.xml"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium">Auto-index new pages</div>
                    <div className="text-xs text-muted-foreground">Check sitemap every 6 hours and submit new URLs automatically</div>
                  </div>
                  <Switch
                    checked={autoIndexEnabled}
                    onCheckedChange={setAutoIndexEnabled}
                  />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium">IndexNow</div>
                    <div className="text-xs text-muted-foreground">Instantly notify Bing, Yandex and other IndexNow-compatible engines</div>
                  </div>
                  <Switch
                    checked={indexNowEnabled}
                    onCheckedChange={setIndexNowEnabled}
                  />
                </div>

                {indexNowEnabled && sitemapSettings?.indexNowKey && (
                  <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">IndexNow Key</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono truncate">{sitemapSettings.indexNowKey}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(sitemapSettings.indexNowKey!);
                          sileo.success({ title: "Key copied" });
                        }}
                      >
                        <IconCopy size={12} className="mr-1" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create a text file at <code className="font-mono">/{sitemapSettings.indexNowKey}.txt</code> on your domain containing only the key above, then verify below.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setVerifyResult(null);
                          verifyIndexNowKey.mutate({ websiteId });
                        }}
                        disabled={verifyIndexNowKey.isPending}
                      >
                        {verifyIndexNowKey.isPending ? <><Spinner size={12} className="mr-1" /> Verifying...</> : "Verify key"}
                      </Button>
                      {verifyResult !== null && (
                        <span className={`flex items-center gap-1 text-xs font-medium ${verifyResult.verified ? "text-green-600" : "text-red-500"}`}>
                          {verifyResult.verified
                            ? <><IconCircleCheck size={14} /> Verified</>
                            : <><IconCircleX size={14} /> Not found at /{verifyResult.key}.txt</>
                          }
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {indexNowEnabled && !sitemapSettings?.indexNowKey && (
                  <p className="text-xs text-muted-foreground">Save settings to generate your IndexNow key.</p>
                )}

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium">Google Indexing API</div>
                    <div className="text-xs text-muted-foreground">Submit new pages directly to Google (200 URLs/day quota)</div>
                  </div>
                  {gaProperties?.hasCredentials ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Connected
                    </span>
                  ) : (
                    <Link href="/settings">
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <IconExternalLink size={12} className="mr-1" />
                        Connect Google
                      </Button>
                    </Link>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setSitemapSaving(true);
                      updateSitemapSettings.mutate({
                        websiteId,
                        sitemapUrl: sitemapUrl.trim() || "",
                        autoIndexEnabled,
                        indexNowEnabled,
                      });
                    }}
                    disabled={sitemapSaving}
                  >
                    {sitemapSaving ? (
                      <><Spinner size={14} className="mr-2" /> Saving...</>
                    ) : (
                      <><IconDeviceFloppy size={16} className="mr-2" />Save Settings</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            {sitemapSettings?.autoIndexEnabled && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Indexing Status</CardTitle>
                      <CardDescription className="flex items-center gap-1.5">
                        {sitemapSettings.stats.pending > 0 ? (
                          <><Spinner size={11} /><span>Checking &amp; submitting URLs...</span></>
                        ) : sitemapSettings.lastSitemapCheck ? (
                          `Last checked ${formatDate(sitemapSettings.lastSitemapCheck)}`
                        ) : "Never checked"}
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIndexTriggering(true);
                        triggerSitemapCheck.mutate({ websiteId });
                      }}
                      disabled={indexTriggering || !sitemapSettings.sitemapUrl}
                    >
                      {indexTriggering ? <><Spinner size={14} className="mr-2" /> Starting...</> : <><IconRefresh size={14} className="mr-2" />Check Now</>}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted/40">
                      <div className="text-2xl font-bold">{sitemapSettings.stats.total}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Total URLs</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/40">
                      <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{sitemapSettings.stats.pending}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Pending</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/40">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">{sitemapSettings.stats.indexed}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Indexed</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/40">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">{sitemapSettings.stats.googleError}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Errors</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div>
                        <div className="text-sm font-medium">Google Indexing API</div>
                        <div className="text-xs text-muted-foreground">
                          {nextSubmitIn && sitemapSettings.stats.pending > 0
                            ? `Next page sending in ${nextSubmitIn}`
                            : "Submitted to Google"}
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sitemapSettings.stats.googleSubmitted}</div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div>
                        <div className="text-sm font-medium">IndexNow</div>
                        <div className="text-xs text-muted-foreground">Submitted to Bing/Yandex</div>
                      </div>
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{sitemapSettings.stats.indexNowSubmitted}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CI/CD Integration */}
            <Card>
              <CardHeader>
                <CardTitle>CI/CD Integration</CardTitle>
                <CardDescription>Trigger indexing after every deploy from your pipeline</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Use your API key (Settings → API Keys) to trigger a check from CI:</p>
                <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto">{`curl -X POST \\
  ${typeof window !== "undefined" ? window.location.origin : ""}/api/websites/${websiteId}/request-index \\
  -H "Authorization: Bearer <your-api-key>"`}</pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    navigator.clipboard.writeText(`curl -X POST \\\n  ${origin}/api/websites/${websiteId}/request-index \\\n  -H "Authorization: Bearer <your-api-key>"`);
                    sileo.success({ title: "Command copied" });
                  }}
                >
                  <IconCopy size={12} className="mr-1" />
                  Copy command
                </Button>
              </CardContent>
            </Card>

          </TabsPanel>

          {/* ─── Uptime Tab ─── */}
          <TabsPanel value="uptime" className="space-y-6">

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Uptime Monitoring</CardTitle>
                <CardDescription>
                  Automatic health checks for your website with incident tracking and notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium">Enable uptime monitoring</div>
                    <div className="text-xs text-muted-foreground">Run periodic health checks and alert on downtime</div>
                  </div>
                  <Switch
                    checked={uptimeEnabled}
                    onCheckedChange={setUptimeEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Check interval</Label>
                  <select
                    value={uptimeInterval}
                    onChange={(e) => setUptimeInterval(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="1">Every 1 minute</option>
                    <option value="2">Every 2 minutes</option>
                    <option value="5">Every 5 minutes</option>
                    <option value="10">Every 10 minutes</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="uptimeKeyword">Keyword to verify (optional)</Label>
                  <Input
                    id="uptimeKeyword"
                    value={uptimeKeyword}
                    onChange={(e) => setUptimeKeyword(e.target.value)}
                    placeholder="e.g. Welcome, Dashboard, Login"
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    If set, alerts when this word disappears from your page content
                  </p>
                </div>

                {uptimeSettings?.uptimeContentHash && (
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm font-medium">Content baseline</div>
                      <div className="text-xs text-muted-foreground">Reset to detect content changes from the current state</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resetUptimeBaseline.mutate({ websiteId })}
                      disabled={resetUptimeBaseline.isPending}
                    >
                      Reset baseline
                    </Button>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => {
                      setUptimeSaving(true);
                      updateUptimeSettings.mutate({
                        websiteId,
                        uptimeEnabled,
                        uptimeKeyword: uptimeKeyword || undefined,
                        uptimeInterval: parseInt(uptimeInterval),
                      });
                    }}
                    disabled={uptimeSaving}
                  >
                    {uptimeSaving ? <><Spinner size={14} className="mr-1.5" /> Saving...</> : <><IconDeviceFloppy size={14} className="mr-1.5" /> Save Settings</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Status (shown when enabled) */}
            {uptimeSettings?.uptimeEnabled && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Uptime Status</CardTitle>
                      <CardDescription>
                        {uptimeSettings.lastUptimeCheck
                          ? `Last checked ${formatDate(uptimeSettings.lastUptimeCheck)}`
                          : "No checks yet"}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => triggerUptimeCheck.mutate({ websiteId })}
                      disabled={triggerUptimeCheck.isPending}
                    >
                      {triggerUptimeCheck.isPending ? <><Spinner size={12} className="mr-1" /> Checking...</> : "Check Now"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-3 h-3 rounded-full ${
                      uptimeSettings.lastUptimeStatus === "up" ? "bg-green-500" :
                      uptimeSettings.lastUptimeStatus === "down" ? "bg-red-500" :
                      uptimeSettings.lastUptimeStatus === "degraded" ? "bg-yellow-500" :
                      "bg-muted"
                    }`} />
                    <span className="text-sm font-medium capitalize">
                      {uptimeSettings.lastUptimeStatus ?? "Pending first check"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-2xl font-bold">
                        {uptimeSettings.uptimeBaselineResponseTime
                          ? `${uptimeSettings.uptimeBaselineResponseTime}ms`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Avg Response</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {uptimeSettings.uptimePercent != null
                          ? `${uptimeSettings.uptimePercent}%`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Uptime (30d)</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{uptimeSettings.totalChecks}</div>
                      <div className="text-xs text-muted-foreground">Total Checks</div>
                    </div>
                    <div>
                      <div className={`text-2xl font-bold ${uptimeSettings.openIncidents > 0 ? "text-red-500" : ""}`}>
                        {uptimeSettings.openIncidents}
                      </div>
                      <div className="text-xs text-muted-foreground">Open Incidents</div>
                    </div>
                  </div>

                  {uptimeSettings.uptimeSslExpiry && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-xs text-muted-foreground">SSL Certificate Expires</div>
                      <div className="text-sm font-medium">{formatDate(uptimeSettings.uptimeSslExpiry)}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Notification Preferences */}
            <NotificationPrefsCard />

          </TabsPanel>

        </Tabs>

      </div>

      {/* Website Deletion Progress Dialog */}
      {showDeletionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <WebsiteDeletionProgress
              websiteId={websiteId}
              onComplete={handleDeletionComplete}
              onCancel={handleDeletionCancel}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
