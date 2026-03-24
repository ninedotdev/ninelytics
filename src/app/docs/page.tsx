"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cloudflare } from "@/components/icons/cloudflare";
import { Google } from "@/components/icons/google";
import { Stripe } from "@/components/icons/stripe";
import { PostHog } from "@/components/icons/posthog";
import { IconSitemap } from "@tabler/icons-react";

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

export default function DocsPage() {
  return (
    <AppLayout>
      <Tabs defaultValue="cloudflare" className="space-y-4">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="cloudflare" className="gap-2">
              <Cloudflare className="h-4 w-4" />
              Cloudflare
            </TabsTrigger>
            <TabsTrigger value="google" className="gap-2">
              <Google className="h-4 w-4" />
              Google
            </TabsTrigger>
            <TabsTrigger value="sitemap" className="gap-2">
              <IconSitemap className="h-4 w-4" />
              Sitemap & Indexing
            </TabsTrigger>
            <TabsTrigger value="stripe" className="gap-2">
              <Stripe className="h-4 w-4" />
              Stripe
            </TabsTrigger>
            <TabsTrigger value="posthog" className="gap-2">
              <PostHog className="h-4 w-4" />
              PostHog
            </TabsTrigger>
            <TabsTrigger value="tracking">Tracking Script</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Cloudflare ─── */}
        <TabsContent value="cloudflare" className="space-y-4">
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
        </TabsContent>

        {/* ─── Google (unified: Analytics + Search Console + Indexing) ─── */}
        <TabsContent value="google" className="space-y-4">
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
        </TabsContent>

        {/* ─── Sitemap & Indexing ─── */}
        <TabsContent value="sitemap" className="space-y-4">
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
        </TabsContent>

        {/* ─── Stripe ─── */}
        <TabsContent value="stripe" className="space-y-4">
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
        </TabsContent>

        {/* ─── PostHog ─── */}
        <TabsContent value="posthog" className="space-y-4">
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
        </TabsContent>

        {/* ─── Tracking Script ─── */}
        <TabsContent value="tracking" className="space-y-4">
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
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
