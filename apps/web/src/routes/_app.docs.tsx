import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
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

export const Route = createFileRoute('/_app/docs')({
  component: DocsPage,
})

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

function DocsPage() {
  const [activeSection, setActiveSection] = useState<string>("cloudflare");
  const appUrl = import.meta.env.VITE_APP_URL || "https://your-domain.com";

  return (
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

      {/* Cloudflare */}
      {activeSection === "cloudflare" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Connect Cloudflare</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import up to 364 days of historical analytics from your Cloudflare zones. This supplements your live tracking data with pageview and visitor counts from Cloudflare.
            </p>
            <div className="space-y-4">
              <Step n={1}>
                <p className="font-medium">Create an API Token</p>
                <p className="text-muted-foreground mt-1">
                  Go to <span className="font-mono text-xs">dash.cloudflare.com/profile/api-tokens</span> and create a token with these permissions:
                </p>
                <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                  <li><strong>Zone &mdash; Zone &mdash; Read</strong></li>
                  <li><strong>Zone &mdash; Analytics &mdash; Read</strong></li>
                </ul>
                <p className="text-muted-foreground mt-1">Set zone resources to <strong>All zones</strong>.</p>
              </Step>
              <Step n={2}>
                <p className="font-medium">Paste the token in Settings</p>
                <p className="text-muted-foreground mt-1">
                  Go to <strong>Settings &rarr; Integrations &rarr; Cloudflare</strong> and paste your token. System will validate it immediately and show your available zones.
                </p>
              </Step>
              <Step n={3}>
                <p className="font-medium">Link a zone to each website</p>
                <p className="text-muted-foreground mt-1">In each website&apos;s settings, select the Cloudflare zone that corresponds to that domain.</p>
              </Step>
              <Step n={4}>
                <p className="font-medium">Sync historical data</p>
                <p className="text-muted-foreground mt-1">
                  Click <strong>Sync Now</strong> to import up to 364 days of data. The data is merged with your live tracking &mdash; the higher value between live and Cloudflare is kept for each day.
                </p>
              </Step>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">How data merges</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Cloudflare data is stored in the shared <code className="text-xs bg-muted px-1 py-0.5 rounded">analyticsData</code> table alongside live tracking data.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Daily charts:</strong> Live data takes priority. CF data fills gaps for days without live tracking.</li>
              <li><strong>Total pageviews:</strong> Live + CF combined (pageviews are summable).</li>
              <li><strong>Total visitors:</strong> Live only (CF daily uniques can&apos;t be summed across days).</li>
              <li><strong>Breakdowns:</strong> Countries, devices, pages from CF are merged with live data by name.</li>
            </ul>
          </CardContent>
        </Card>
      </div>}

      {/* Google */}
      {activeSection === "google" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Connect with Google OAuth</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              One OAuth connection unlocks three integrations: <strong>Google Analytics 4</strong>, <strong>Search Console</strong>, and the <strong>Indexing API</strong>.
              No service account JSON required — just click &quot;Connect with Google&quot; in Settings.
            </p>
            <div className="space-y-4">
              <Step n={1}>
                <strong>Create a Google Cloud project</strong>
                <p className="text-muted-foreground mt-1">Go to <span className="font-mono text-xs">console.cloud.google.com</span> and create a project (or use an existing one).</p>
              </Step>
              <Step n={2}>
                <strong>Enable the required APIs</strong>
                <p className="text-muted-foreground mt-1">Go to <strong>APIs &amp; Services &rarr; Library</strong> and enable all of these:</p>
                <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                  <li><strong>Google Analytics Data API</strong></li>
                  <li><strong>Google Analytics Admin API</strong></li>
                  <li><strong>Google Search Console API</strong></li>
                  <li><strong>Web Search Indexing API</strong> — required for the Google Indexing API (URL submission)</li>
                </ul>
              </Step>
              <Step n={3}>
                <strong>Create an OAuth 2.0 Client ID</strong>
                <p className="text-muted-foreground mt-1">Go to <strong>APIs &amp; Services &rarr; Credentials &rarr; Create Credentials &rarr; OAuth 2.0 Client ID</strong>. Select <strong>Web application</strong> as the type.</p>
              </Step>
              <Step n={4}>
                <strong>Add the redirect URI</strong>
                <p className="text-muted-foreground mt-1">Under <strong>Authorized redirect URIs</strong>, add:</p>
                <CodeBlock>{`https://your-domain.com/api/google/callback`}</CodeBlock>
                <p className="text-muted-foreground mt-1">
                  Replace <code className="text-xs bg-muted px-1 py-0.5 rounded">your-domain.com</code> with your actual domain.
                  For local dev, also add <code className="text-xs bg-muted px-1 py-0.5 rounded">http://localhost:3000/api/google/callback</code>.
                </p>
              </Step>
              <Step n={5}>
                <strong>Set environment variables</strong>
                <p className="text-muted-foreground mt-1">Copy your Client ID and Client Secret and add them to your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> file:</p>
                <CodeBlock>{`GOOGLE_API_CLIENT_ID="your-oauth-client-id"
GOOGLE_API_CLIENT_SECRET="your-oauth-client-secret"`}</CodeBlock>
              </Step>
              <Step n={6}>
                <strong>Connect in Settings</strong>
                <p className="text-muted-foreground mt-1">
                  Go to <strong>Settings &rarr; Integrations</strong> and click <strong>&quot;Connect with Google&quot;</strong>.
                </p>
              </Step>
              <Step n={7}>
                <strong>Link properties per website</strong>
                <p className="text-muted-foreground mt-1">Go to <strong>Websites &rarr; [your site] &rarr; Settings</strong>:</p>
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
          <CardHeader><CardTitle className="text-sm font-medium">Google Analytics — what is imported</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Imports up to 364 days of historical data from your GA4 property. Data is stored in the shared <code className="text-xs bg-muted px-1 py-0.5 rounded">analyticsData</code> table alongside live tracking and Cloudflare data. The higher value per day is kept.</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Pageviews &amp; visitors</strong> — daily totals</li>
              <li><strong>Countries, devices, browsers, pages</strong> — breakdowns on demand</li>
              <li><strong>Sync is manual</strong> — click &quot;Sync Now&quot; to pull latest data</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Search Console — what is imported</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Imports the last 90 days of daily query-level data. Powers AI Insights cross-referencing search performance with on-site analytics.</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Queries</strong> — what people searched to find your site</li>
              <li><strong>Impressions</strong> — how often your site appeared in results</li>
              <li><strong>Clicks &amp; CTR</strong> — click-through rate per query</li>
              <li><strong>Position</strong> — average ranking per query/page</li>
            </ul>
          </CardContent>
        </Card>
      </div>}

      {/* Sitemap */}
      {activeSection === "sitemap" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Sitemap Auto-Indexing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Automatically detect new URLs in your sitemap and submit them to search engines. Supports <strong>Google Indexing API</strong> and <strong>IndexNow</strong>.
            </p>
            <div className="space-y-4">
              <Step n={1}><strong>Enable auto-indexing</strong><p className="text-muted-foreground mt-1">Go to <strong>Websites &rarr; [your site] &rarr; Settings &rarr; Indexing</strong>. Enter your sitemap URL and enable <strong>Auto-indexing</strong>.</p></Step>
              <Step n={2}><strong>Connect Google (for Google Indexing API)</strong><p className="text-muted-foreground mt-1">Connect your Google account in <strong>Settings &rarr; Integrations</strong>. Your site must be a <strong>Verified Owner</strong> property in Search Console.</p></Step>
              <Step n={3}><strong>Set up IndexNow (for Bing/Yandex)</strong><p className="text-muted-foreground mt-1">Enable <strong>IndexNow</strong> in the Indexing tab. Host a text file at the path shown so search engines can verify ownership:</p>
                <CodeBlock>{`# File location:\nhttps://your-domain.com/{your-key}.txt\n\n# File contents (just the key, nothing else):\nyour-indexnow-key`}</CodeBlock>
              </Step>
              <Step n={4}><strong>Trigger a check</strong><p className="text-muted-foreground mt-1">Click <strong>Check Now</strong> to run immediately.</p></Step>
              <Step n={5}><strong>CI/CD integration</strong>
                <CodeBlock>{`curl -X POST https://your-domain.com/api/websites/{websiteId}/request-index \\\n  -H "x-api-key: your-api-key"`}</CodeBlock>
              </Step>
            </div>
          </CardContent>
        </Card>
      </div>}

      {/* Stripe */}
      {activeSection === "stripe" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Connect Stripe</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import revenue data from Stripe to correlate with your analytics. The AI can then provide insights that connect traffic patterns with revenue.
            </p>
            <Step n={1}><strong>Create a Restricted API Key</strong><br />Go to Stripe Dashboard &rarr; Developers &rarr; API Keys and click <strong>&quot;Create restricted key&quot;</strong>.</Step>
            <Step n={2}><strong>Set permissions (read-only)</strong><br />Grant read access to Charges, Customers, Subscriptions, Invoices, Balance.</Step>
            <Step n={3}><strong>Paste in Website Settings</strong><br />Go to <strong>Websites &rarr; [your site] &rarr; Settings</strong>, find the Stripe card, and paste the restricted key.</Step>
            <Step n={4}><strong>Sync data</strong><br />Click <strong>&quot;Sync Now&quot;</strong> to import the last 90 days of charges and customer data.</Step>
          </CardContent>
        </Card>
      </div>}

      {/* PostHog */}
      {activeSection === "posthog" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Connect PostHog</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Import analytics data from PostHog — pageviews, visitors, sessions, bounce rate, countries, devices, pages, and referrers.</p>
            <Step n={1}><strong>Get your Project ID</strong><br />In PostHog, go to <strong>Settings &rarr; Project</strong> and copy your Project ID.</Step>
            <Step n={2}><strong>Create a Personal API Key</strong><br />Go to <strong>Settings &rarr; Personal API Keys</strong> and create a key with <strong>Query Read</strong> permission.</Step>
            <Step n={3}><strong>Connect in Website Settings</strong><br />Go to <strong>Websites &rarr; [your site] &rarr; Settings &rarr; Integrations</strong>, find PostHog, enter your host URL, project ID, and API key.</Step>
            <Step n={4}><strong>Sync data</strong><br />Click <strong>&quot;Sync Now&quot;</strong> to import up to 365 days of analytics data.</Step>
          </CardContent>
        </Card>
      </div>}

      {/* Tracking Script */}
      {activeSection === "tracking" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Install the tracking script</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Add this script to your website to start collecting analytics.</p>
            <div className="space-y-4">
              <Step n={1}><p className="font-medium">Copy your tracking script</p><p className="text-muted-foreground mt-1">Go to <strong>Websites &rarr; your site &rarr; Settings</strong> and copy the tracking code snippet.</p></Step>
              <Step n={2}><p className="font-medium">Add it to your site</p>
                <p className="text-muted-foreground mt-1">Paste before <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;/head&gt;</code> or <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code>.</p>
                <CodeBlock>{`<script
  src="${appUrl}/analytics.js"
  data-tracking-code="YOUR_TRACKING_CODE"
  defer
></script>`}</CodeBlock>
              </Step>
              <Step n={3}><p className="font-medium">Verify it works</p><p className="text-muted-foreground mt-1">Visit your website, then check <strong>Real-time</strong>. You should see yourself as an active visitor within seconds.</p></Step>
            </div>
          </CardContent>
        </Card>
      </div>}

      {/* Telegram */}
      {activeSection === "telegram" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Telegram Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Receive uptime alerts (down, recovered, degraded, SSL expiry) directly in Telegram via your own bot.</p>
            <div className="space-y-4">
              <Step n={1}><p className="font-medium">Create a Telegram Bot</p><p className="text-muted-foreground mt-1">Message <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a>. Send <code className="bg-muted px-1 rounded text-xs">/newbot</code>, choose a name, and copy the <strong>bot token</strong>.</p></Step>
              <Step n={2}><p className="font-medium">Get your Chat ID</p><p className="text-muted-foreground mt-1">Message <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline">@userinfobot</a> to get your numeric <strong>Chat ID</strong>.</p></Step>
              <Step n={3}><p className="font-medium">Connect in Settings</p><p className="text-muted-foreground mt-1">Go to <strong>Settings → Integrations → Telegram</strong>, paste both the bot token and chat ID, and click <strong>Connect & Test</strong>.</p></Step>
              <Step n={4}><p className="font-medium">Enable per-website</p><p className="text-muted-foreground mt-1">In each website&apos;s <strong>Settings → Uptime → Notification Preferences</strong>, toggle <strong>Telegram</strong> on.</p></Step>
            </div>
          </CardContent>
        </Card>
      </div>}

      {/* Uptime */}
      {activeSection === "uptime" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Uptime Monitoring</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Automatic health checks for all your websites with incident tracking, estimated lost visitors, and multi-channel notifications.</p>
            <div className="space-y-4">
              <Step n={1}><p className="font-medium">Enable per website</p><p className="text-muted-foreground mt-1">Go to <strong>Website Settings → Uptime</strong> tab and toggle <strong>Enable uptime monitoring</strong>.</p></Step>
              <Step n={2}><p className="font-medium">Health checks</p><p className="text-muted-foreground mt-1">Each check performs HTTP status, response time, optional keyword presence, content hash, and SSL expiry detection.</p></Step>
              <Step n={3}><p className="font-medium">Incidents</p><p className="text-muted-foreground mt-1">When a site goes down, an incident is opened automatically. On recovery, the incident is closed with duration and estimated lost visitors.</p></Step>
              <Step n={4}><p className="font-medium">Notifications</p><p className="text-muted-foreground mt-1">Configure notification preferences per website. Channels: in-app, email, SMS, Telegram.</p></Step>
              <Step n={5}><p className="font-medium">Optional keyword check</p><p className="text-muted-foreground mt-1">Set a keyword that must appear in the page HTML. If it disappears, an alert is triggered even if HTTP is 200.</p></Step>
            </div>
          </CardContent>
        </Card>
      </div>}
    </div>
  );
}
