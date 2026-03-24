"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cloudflare } from "@/components/icons/cloudflare";
import { Google } from "@/components/icons/google";
import { Stripe } from "@/components/icons/stripe";
import { PostHog } from "@/components/icons/posthog";
import { Telegram } from "@/components/icons/telegram";
import { IconSitemap, IconHeartRateMonitor } from "@tabler/icons-react";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
        {n}
      </div>
      <div className="text-sm leading-relaxed pt-0.5">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto my-2">
      <code>{children}</code>
    </pre>
  );
}

const DOC_SECTIONS = [
  { value: "cloudflare", label: "Cloudflare", icon: <Cloudflare className="h-4 w-4" /> },
  { value: "google", label: "Google (GA4 + Search Console)", icon: <Google className="h-4 w-4" /> },
  { value: "sitemap", label: "Sitemap & Indexing", icon: <IconSitemap className="h-4 w-4" /> },
  { value: "stripe", label: "Stripe", icon: <Stripe className="h-4 w-4" /> },
  { value: "posthog", label: "PostHog", icon: <PostHog className="h-4 w-4" /> },
  { value: "telegram", label: "Telegram Alerts", icon: <Telegram className="h-4 w-4" /> },
  { value: "uptime", label: "Uptime Monitoring", icon: <IconHeartRateMonitor className="h-4 w-4" /> },
  { value: "tracking", label: "Tracking Script" },
] as const;

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<string>("cloudflare");

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Documentation</h1>
          <Select value={activeSection} onValueChange={setActiveSection}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_SECTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  <span className="flex items-center gap-2">
                    {"icon" in s && s.icon}
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ─── Cloudflare ─── */}
        {activeSection === "cloudflare" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Connect Cloudflare
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import up to 364 days of historical analytics from your
                Cloudflare zones. This supplements your live tracking data with
                pageview and visitor counts from Cloudflare.
              </p>

              <div className="space-y-4">
                <Step n={1}>
                  <p className="font-medium">Create an API Token</p>
                  <p className="text-muted-foreground mt-1">
                    Go to{" "}
                    <span className="font-mono text-xs">
                      dash.cloudflare.com/profile/api-tokens
                    </span>{" "}
                    and create a token with these permissions:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                    <li>
                      <strong>Zone &mdash; Zone &mdash; Read</strong>
                    </li>
                    <li>
                      <strong>Zone &mdash; Analytics &mdash; Read</strong>
                    </li>
                  </ul>
                  <p className="text-muted-foreground mt-1">
                    Set zone resources to <strong>All zones</strong>.
                  </p>
                </Step>

                <Step n={2}>
                  <p className="font-medium">Paste the token in Settings</p>
                  <p className="text-muted-foreground mt-1">
                    Go to{" "}
                    <strong>
                      Settings &rarr; Integrations &rarr; Cloudflare
                    </strong>{" "}
                    and paste your token. System will validate it immediately
                    and show your available zones.
                  </p>
                </Step>

                <Step n={3}>
                  <p className="font-medium">Link a zone to each website</p>
                  <p className="text-muted-foreground mt-1">
                    In each website&apos;s settings, select the Cloudflare zone
                    that corresponds to that domain.
                  </p>
                </Step>

                <Step n={4}>
                  <p className="font-medium">Sync historical data</p>
                  <p className="text-muted-foreground mt-1">
                    Click <strong>Sync Now</strong> to import up to 364 days of
                    data. The data is merged with your live tracking &mdash; the
                    higher value between live and Cloudflare is kept for each
                    day.
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                How data merges
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Cloudflare data is stored in the shared{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  analyticsData
                </code>{" "}
                table alongside live tracking data.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Daily charts:</strong> Live data takes priority. CF
                  data fills gaps for days without live tracking.
                </li>
                <li>
                  <strong>Total pageviews:</strong> Live + CF combined
                  (pageviews are summable).
                </li>
                <li>
                  <strong>Total visitors:</strong> Live only (CF daily uniques
                  can&apos;t be summed across days).
                </li>
                <li>
                  <strong>Breakdowns:</strong> Countries, devices, pages from CF
                  are merged with live data by name.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>}

        {/* ─── Google ─── */}
        {activeSection === "google" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Connect with Google OAuth</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                One OAuth connection unlocks three integrations: <strong>Google Analytics 4</strong>,{" "}
                <strong>Search Console</strong>, and the <strong>Indexing API</strong>.
                No service account JSON required — just click &quot;Connect with Google&quot; in Settings.
              </p>

              <div className="space-y-4">
                <Step n={1}>
                  <strong>Create a Google Cloud project</strong>
                  <p className="text-muted-foreground mt-1">
                    Go to{" "}
                    <span className="font-mono text-xs">console.cloud.google.com</span>{" "}
                    and create a project (or use an existing one).
                  </p>
                </Step>

                <Step n={2}>
                  <strong>Enable the required APIs</strong>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>APIs &amp; Services &rarr; Library</strong> and enable all of these:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                    <li><strong>Google Analytics Data API</strong></li>
                    <li><strong>Google Analytics Admin API</strong></li>
                    <li><strong>Google Search Console API</strong></li>
                    <li><strong>Web Search Indexing API</strong> — required for the Google Indexing API (URL submission)</li>
                  </ul>
                </Step>

                <Step n={3}>
                  <strong>Create an OAuth 2.0 Client ID</strong>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>APIs &amp; Services &rarr; Credentials &rarr; Create Credentials &rarr; OAuth 2.0 Client ID</strong>.
                    Select <strong>Web application</strong> as the type.
                  </p>
                </Step>

                <Step n={4}>
                  <strong>Add the redirect URI</strong>
                  <p className="text-muted-foreground mt-1">
                    Under <strong>Authorized redirect URIs</strong>, add:
                  </p>
                  <CodeBlock>{`https://your-domain.com/api/google/callback`}</CodeBlock>
                  <p className="text-muted-foreground mt-1">
                    Replace <code className="text-xs bg-muted px-1 py-0.5 rounded">your-domain.com</code> with your actual domain.
                    For local dev, also add <code className="text-xs bg-muted px-1 py-0.5 rounded">http://localhost:3000/api/google/callback</code>.
                  </p>
                </Step>

                <Step n={5}>
                  <strong>Set environment variables</strong>
                  <p className="text-muted-foreground mt-1">
                    Copy your Client ID and Client Secret and add them to your{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> file:
                  </p>
                  <CodeBlock>{`GOOGLE_API_CLIENT_ID="your-oauth-client-id"
GOOGLE_API_CLIENT_SECRET="your-oauth-client-secret"`}</CodeBlock>
                  <p className="text-muted-foreground mt-1 text-xs">
                    These are separate from <code className="bg-muted px-1 py-0.5 rounded">GOOGLE_CLIENT_ID</code> / <code className="bg-muted px-1 py-0.5 rounded">GOOGLE_CLIENT_SECRET</code> used for sign-in.
                    You can use the same OAuth app for both — just add both redirect URIs.
                  </p>
                </Step>

                <Step n={6}>
                  <strong>Connect in Settings</strong>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>Settings &rarr; Integrations</strong> and click{" "}
                    <strong>&quot;Connect with Google&quot;</strong>. Google will ask you to grant access to
                    Analytics, Search Console, and the Indexing API. Click <strong>Allow</strong> on all.
                  </p>
                </Step>

                <Step n={7}>
                  <strong>Link properties per website</strong>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>Websites &rarr; [your site] &rarr; Settings</strong>:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                    <li><strong>Google Analytics:</strong> select a GA4 property &rarr; Sync Now</li>
                    <li><strong>Search Console:</strong> select a verified property &rarr; Sync Now</li>
                    <li><strong>Sitemap &amp; Indexing:</strong> enable auto-indexing in the Indexing tab</li>
                  </ul>
                </Step>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Google Analytics — what is imported</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Imports up to 364 days of historical data from your GA4 property.
                Data is stored in the shared <code className="text-xs bg-muted px-1 py-0.5 rounded">analyticsData</code> table
                alongside live tracking and Cloudflare data. The higher value per day is kept.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Pageviews &amp; visitors</strong> — daily totals</li>
                <li><strong>Countries, devices, browsers, pages</strong> — breakdowns on demand</li>
                <li><strong>Sync is manual</strong> — click &quot;Sync Now&quot; to pull latest data</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Search Console — what is imported</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Imports the last 90 days of daily query-level data. Powers AI Insights cross-referencing
                search performance with on-site analytics.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Queries</strong> — what people searched to find your site</li>
                <li><strong>Impressions</strong> — how often your site appeared in results</li>
                <li><strong>Clicks &amp; CTR</strong> — click-through rate per query</li>
                <li><strong>Position</strong> — average ranking per query/page</li>
              </ul>
              <p className="mt-2">
                The connected Google account must be a <strong>Verified Owner</strong> of the Search Console
                property (not just &quot;Full user&quot;). Check in Search Console &rarr; Settings &rarr; Users and permissions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Indexing API — permissions required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The <strong>Web Search Indexing API</strong> (<code className="text-xs bg-muted px-1 py-0.5 rounded">indexing.googleapis.com</code>) must be
                enabled in your Google Cloud project. Without it, submissions return a 403 even if the token is valid.
              </p>
              <p>
                Additionally, the connected Google account must be a <strong>Verified Owner</strong> of the site
                in Search Console — Google requires ownership verification before accepting Indexing API submissions.
              </p>
              <p>
                If you recently enabled the API or reconnected your account, wait a few minutes for Google to propagate
                the change before retrying.
              </p>
            </CardContent>
          </Card>
        </div>}

        {/* ─── Sitemap & Indexing ─── */}
        {activeSection === "sitemap" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Sitemap Auto-Indexing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Automatically detect new URLs in your sitemap and submit them to search engines.
                Supports <strong>Google Indexing API</strong> (direct URL submission) and{" "}
                <strong>IndexNow</strong> (Bing, Yandex, and other IndexNow-compatible engines).
              </p>

              <div className="space-y-4">
                <Step n={1}>
                  <strong>Enable auto-indexing</strong>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>Websites &rarr; [your site] &rarr; Settings &rarr; Indexing</strong>.
                    Enter your sitemap URL and enable <strong>Auto-indexing</strong>.
                  </p>
                </Step>

                <Step n={2}>
                  <strong>Connect Google (for Google Indexing API)</strong>
                  <p className="text-muted-foreground mt-1">
                    Connect your Google account in <strong>Settings &rarr; Integrations</strong> and
                    ensure the <strong>Web Search Indexing API</strong> is enabled in your Google Cloud project.
                    Your site must be a <strong>Verified Owner</strong> property in Search Console.
                  </p>
                </Step>

                <Step n={3}>
                  <strong>Set up IndexNow (for Bing/Yandex)</strong>
                  <p className="text-muted-foreground mt-1">
                    Enable <strong>IndexNow</strong> in the Indexing tab. A key is auto-generated.
                    Host a text file at the path shown so search engines can verify ownership:
                  </p>
                  <CodeBlock>{`# File location:
https://your-domain.com/{your-key}.txt

# File contents (just the key, nothing else):
your-indexnow-key`}</CodeBlock>
                  <p className="text-muted-foreground mt-1">
                    Click <strong>Verify key</strong> to confirm the file is accessible. Once verified,
                    new URLs are submitted to Bing and Yandex in a single batch request.
                  </p>
                </Step>

                <Step n={4}>
                  <strong>Trigger a check</strong>
                  <p className="text-muted-foreground mt-1">
                    Click <strong>Check Now</strong> to run immediately. The workflow will:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                    <li>Fetch and diff the sitemap against known URLs</li>
                    <li>Insert new URLs with status <strong>pending</strong></li>
                    <li>Submit new URLs to IndexNow (batch, instant)</li>
                    <li>Submit all pending/error URLs to Google one by one (8 min between each — Google&apos;s rate limit)</li>
                    <li>Check previously submitted URLs for indexed status via URL Inspection API</li>
                  </ul>
                </Step>

                <Step n={5}>
                  <strong>CI/CD integration</strong>
                  <p className="text-muted-foreground mt-1">
                    Trigger a check automatically after every deploy using your API key:
                  </p>
                  <CodeBlock>{`curl -X POST https://your-domain.com/api/websites/{websiteId}/request-index \\
  -H "x-api-key: your-api-key"`}</CodeBlock>
                  <p className="text-muted-foreground mt-1">
                    Get your API key from <strong>Settings &rarr; API Keys</strong>. The curl command with your
                    actual IDs is shown in the Indexing tab of each website.
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">URL status explained</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Pending</strong> — URL found in sitemap, not yet submitted to Google</li>
                <li><strong>Errors</strong> — Google returned an error (403 = scope or ownership issue, 429 = quota exceeded)</li>
                <li><strong>Google Indexing API</strong> — successfully submitted to Google (Google acknowledged the request)</li>
                <li><strong>IndexNow</strong> — submitted to Bing/Yandex via IndexNow batch</li>
                <li><strong>Indexed</strong> — confirmed indexed by Google via URL Inspection API</li>
              </ul>
              <p className="mt-2">
                Submitting to the Indexing API does <strong>not</strong> guarantee indexing — it signals Google to crawl sooner.
                The &quot;Indexed&quot; count is checked via URL Inspection API (up to 50 URLs per run, 2,000/day quota).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Scheduler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                In addition to manual checks, the <strong>sitemap scheduler</strong> runs every 6 hours automatically
                for all websites with auto-indexing enabled. It submits new URLs found since the last check.
              </p>
              <p>
                The scheduler is a durable workflow — if the server restarts mid-run, it resumes from where it left off.
                Each Google URL submission is separated by an 8-minute sleep to respect Google&apos;s rate limits.
              </p>
            </CardContent>
          </Card>
        </div>}

        {/* ─── Stripe ─── */}
        {activeSection === "stripe" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Connect Stripe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import revenue data from Stripe to correlate with your analytics.
                The AI can then provide insights that connect traffic patterns
                with revenue, customer acquisition, and conversion trends.
              </p>

              <Step n={1}>
                <strong>Create a Restricted API Key</strong>
                <br />
                Go to the Stripe Dashboard &rarr; Developers &rarr; API Keys
                and click <strong>&quot;Create restricted key&quot;</strong>.
              </Step>

              <Step n={2}>
                <strong>Set permissions (read-only)</strong>
                <br />
                Grant read access to these resources only:
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground">
                  <li>Charges — Read</li>
                  <li>Customers — Read</li>
                  <li>Subscriptions — Read</li>
                  <li>Invoices — Read</li>
                  <li>Balance — Read</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-1">
                  Leave all other permissions as &quot;None&quot;.
                </p>
              </Step>

              <Step n={3}>
                <strong>Paste in Website Settings</strong>
                <br />
                Go to <strong>Websites &rarr; [your site] &rarr; Settings</strong>,
                find the Stripe card, and paste the restricted key.
                Each website gets its own key (one Stripe account per website).
              </Step>

              <Step n={4}>
                <strong>Sync data</strong>
                <br />
                Click <strong>&quot;Sync Now&quot;</strong> to import the last 90 days of
                charges and customer data.
              </Step>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                What data is imported?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Each sync imports daily revenue aggregates:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><strong>Revenue</strong> — total successful charges per day</li>
                <li><strong>Refunds</strong> — refund amounts and counts</li>
                <li><strong>Charges</strong> — number of successful transactions</li>
                <li><strong>New Customers</strong> — customers created per day</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                When Stripe data is available, <strong>AI Insights</strong> correlates
                revenue with traffic — identifying which sources drive the most
                revenue, conversion efficiency, and customer acquisition patterns.
              </p>
            </CardContent>
          </Card>
        </div>}

        {/* ─── PostHog ─── */}
        {activeSection === "posthog" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Connect PostHog
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import analytics data from PostHog — pageviews, visitors, sessions,
                bounce rate, countries, devices, pages, and referrers. Uses PostHog&apos;s
                HogQL Query API.
              </p>

              <Step n={1}>
                <strong>Get your Project ID</strong>
                <br />
                In PostHog, go to <strong>Settings &rarr; Project</strong> and copy
                your Project ID (numeric).
              </Step>

              <Step n={2}>
                <strong>Create a Personal API Key</strong>
                <br />
                Go to <strong>Settings &rarr; Personal API Keys</strong> and create
                a key with <strong>Query Read</strong> permission.
              </Step>

              <Step n={3}>
                <strong>Connect in Website Settings</strong>
                <br />
                Go to <strong>Websites &rarr; [your site] &rarr; Settings &rarr; Integrations</strong>,
                find the PostHog card, enter your host URL, project ID, and API key.
              </Step>

              <Step n={4}>
                <strong>Sync data</strong>
                <br />
                Click <strong>&quot;Sync Now&quot;</strong> to import up to 365 days of analytics data.
              </Step>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                What data is imported?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                PostHog provides the richest import — including session-level metrics:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><strong>Pageviews</strong> — daily totals with page path distribution</li>
                <li><strong>Unique visitors</strong> — distinct users per day</li>
                <li><strong>Sessions</strong> — with bounce rate and average duration</li>
                <li><strong>Countries &amp; Cities</strong> — geographic distribution</li>
                <li><strong>Devices, Browsers, OS</strong> — technology breakdown</li>
                <li><strong>Referrers</strong> — traffic sources</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                Works with both PostHog Cloud (us.posthog.com / eu.posthog.com)
                and self-hosted instances.
              </p>
            </CardContent>
          </Card>
        </div>}

        {/* ─── Tracking Script ─── */}
        {activeSection === "tracking" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Install the tracking script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add this script to your website to start collecting analytics.
                You can find your tracking code in each website&apos;s settings.
              </p>

              <div className="space-y-4">
                <Step n={1}>
                  <p className="font-medium">Copy your tracking script</p>
                  <p className="text-muted-foreground mt-1">
                    Go to{" "}
                    <strong>Websites &rarr; your site &rarr; Settings</strong>{" "}
                    and copy the tracking code snippet.
                  </p>
                </Step>

                <Step n={2}>
                  <p className="font-medium">Add it to your site</p>
                  <p className="text-muted-foreground mt-1">
                    Paste the script tag before{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      &lt;/head&gt;
                    </code>{" "}
                    or{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      &lt;/body&gt;
                    </code>{" "}
                    on every page, main or individual layout you want to track.
                    <br />
                    The snippet is also provided when you create a website.
                  </p>
                  <CodeBlock>{`<script
  src="${process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com"}/analytics.js"
  data-tracking-code="YOUR_TRACKING_CODE"
  defer
></script>`}</CodeBlock>
                </Step>

                <Step n={3}>
                  <p className="font-medium">Verify it works</p>
                  <p className="text-muted-foreground mt-1">
                    Visit your website, then check the{" "}
                    <strong>Real-time</strong> page. You should see yourself as
                    an active visitor within seconds.
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                What gets tracked
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>The tracker automatically collects:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Page views</strong> — including SPA navigation
                  (pushState/replaceState)
                </li>
                <li>
                  <strong>Sessions</strong> — 30-minute inactivity timeout
                </li>
                <li>
                  <strong>Device info</strong> — browser, OS, screen size,
                  device type
                </li>
                <li>
                  <strong>Traffic sources</strong> — referrer, UTM parameters,
                  search engines
                </li>
                <li>
                  <strong>Engagement</strong> — scroll depth, time on page, rage
                  clicks, exit intent
                </li>
                <li>
                  <strong>Performance</strong> — load time, FCP, TTI, DCL
                </li>
                <li>
                  <strong>Geolocation</strong> — country, city, coordinates
                  (from IP)
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>}

        {/* ─── Telegram ─── */}
        {activeSection === "telegram" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Telegram Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Receive uptime alerts (down, recovered, degraded, SSL expiry) directly in Telegram via your own bot.
              </p>
              <div className="space-y-4">
                <Step n={1}>
                  <p className="font-medium">Create a Telegram Bot</p>
                  <p className="text-muted-foreground mt-1">
                    Open Telegram and message{" "}
                    <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a>.
                    Send <code className="bg-muted px-1 rounded text-xs">/newbot</code>, choose a name, and copy the <strong>bot token</strong>.
                  </p>
                </Step>
                <Step n={2}>
                  <p className="font-medium">Get your Chat ID</p>
                  <p className="text-muted-foreground mt-1">
                    Start a conversation with your new bot (send any message), then message{" "}
                    <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline">@userinfobot</a>{" "}
                    to get your numeric <strong>Chat ID</strong>. For group chats, add the bot to the group and use the group Chat ID (starts with <code className="bg-muted px-1 rounded text-xs">-</code>).
                  </p>
                </Step>
                <Step n={3}>
                  <p className="font-medium">Connect in Settings</p>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>Settings → Integrations → Telegram</strong>, paste both the bot token and chat ID, and click <strong>Connect & Test</strong>.
                    A test message will be sent to confirm the connection.
                  </p>
                </Step>
                <Step n={4}>
                  <p className="font-medium">Enable per-website</p>
                  <p className="text-muted-foreground mt-1">
                    In each website&apos;s <strong>Settings → Uptime → Notification Preferences</strong>, toggle <strong>Telegram</strong> on.
                    You can choose which events trigger Telegram alerts (down, recovered, degraded, SSL, content change).
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>
        </div>}

        {/* ─── Uptime Monitoring ─── */}
        {activeSection === "uptime" && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Uptime Monitoring</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Automatic health checks for all your websites with incident tracking, estimated lost visitors, and multi-channel notifications.
              </p>
              <div className="space-y-4">
                <Step n={1}>
                  <p className="font-medium">Enable per website</p>
                  <p className="text-muted-foreground mt-1">
                    Go to <strong>Website Settings → Uptime</strong> tab and toggle <strong>Enable uptime monitoring</strong>.
                    Choose the check interval (1–30 minutes).
                  </p>
                </Step>
                <Step n={2}>
                  <p className="font-medium">Health checks</p>
                  <p className="text-muted-foreground mt-1">
                    Each check performs: HTTP status verification, response time measurement, optional keyword presence check, content hash comparison, and SSL certificate expiry detection.
                    Degraded is triggered when response time exceeds 2× the rolling baseline.
                  </p>
                </Step>
                <Step n={3}>
                  <p className="font-medium">Incidents</p>
                  <p className="text-muted-foreground mt-1">
                    When a site goes down, an incident is opened automatically. On recovery, the incident is closed with duration and an estimated count of lost visitors (based on your average traffic). View incidents on the website detail page.
                  </p>
                </Step>
                <Step n={4}>
                  <p className="font-medium">Notifications</p>
                  <p className="text-muted-foreground mt-1">
                    Configure notification preferences per website in the <strong>Uptime → Notification Preferences</strong> card.
                    Channels: in-app (bell icon), email (via Resend), SMS (via Twilio), and Telegram.
                    All external channels are optional — if not configured, only in-app notifications are sent.
                  </p>
                </Step>
                <Step n={5}>
                  <p className="font-medium">Optional keyword check</p>
                  <p className="text-muted-foreground mt-1">
                    Set a keyword (e.g. your site name or &quot;Dashboard&quot;) that must appear in the page HTML.
                    If the keyword disappears (e.g. error page is served), an alert is triggered even if HTTP status is 200.
                  </p>
                </Step>
              </div>
            </CardContent>
          </Card>
        </div>}
      </div>
    </AppLayout>
  );
}
