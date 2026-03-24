'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowLeft, IconGlobe, IconCode } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { CodeBlock } from '@/components/ui/code-block'
import { sileo } from "sileo";
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/utils/trpc'

const websiteSchema = z.object({
  name: z.string().min(1, 'Website name is required'),
  url: z
    .string()
    .min(1, 'Website URL is required')
    .transform((val) => {
      const stripped = val.replace(/^https?:\/\//i, '').trim()
      return `https://${stripped}`
    })
    .pipe(z.string().url('Please enter a valid domain (e.g. example.com)')),
  description: z.string().optional(),
})

type WebsiteFormData = z.infer<typeof websiteSchema>

function parseTrackingScript(script: string) {
  const srcMatch = script.match(/src="([^"]+)"/)
  const codeMatch = script.match(/data-tracking-code="([^"]+)"/)
  return {
    scriptUrl: srcMatch?.[1] ?? '',
    code: codeMatch?.[1] ?? '',
  }
}

function getSnippets(scriptUrl: string, code: string) {
  return {
    html: {
      label: 'HTML',
      language: 'html',
      snippet: `<!-- Analytics Tracking Script -->
<script src="${scriptUrl}" data-tracking-code="${code}" defer></script>`,
    },
    nextjs: {
      label: 'Next.js',
      language: 'tsx',
      snippet: `// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="${scriptUrl}"
          data-tracking-code="${code}"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}`,
    },
    remix: {
      label: 'Remix',
      language: 'tsx',
      snippet: `// app/root.tsx
import { Scripts, Links, Meta, Outlet } from "@remix-run/react";

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <script
          src="${scriptUrl}"
          data-tracking-code="${code}"
          defer
        />
        <Scripts />
      </body>
    </html>
  );
}`,
    },
    astro: {
      label: 'Astro',
      language: 'astro',
      snippet: `---
// src/layouts/Layout.astro
---
<html lang="en">
  <head>
    <script src="${scriptUrl}" data-tracking-code="${code}" defer></script>
  </head>
  <body>
    <slot />
  </body>
</html>`,
    },
    nuxt: {
      label: 'Nuxt',
      language: 'typescript',
      snippet: `// nuxt.config.ts
export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          src: "${scriptUrl}",
          "data-tracking-code": "${code}",
          defer: true,
        },
      ],
    },
  },
});`,
    },
    gatsby: {
      label: 'Gatsby',
      language: 'tsx',
      snippet: `// gatsby-ssr.tsx
import type { GatsbySSR } from "gatsby";

export const onRenderBody: GatsbySSR["onRenderBody"] = ({ setPostBodyComponents }) => {
  setPostBodyComponents([
    <script
      key="analytics"
      src="${scriptUrl}"
      data-tracking-code="${code}"
      defer
    />,
  ]);
};`,
    },
    wordpress: {
      label: 'WordPress',
      language: 'php',
      snippet: `// functions.php
function add_analytics_script() {
    wp_enqueue_script(
        'analytics-tracking',
        '${scriptUrl}',
        array(),
        null,
        true
    );
    wp_script_add_data('analytics-tracking', 'data-tracking-code', '${code}');
}
add_action('wp_enqueue_scripts', 'add_analytics_script');

// Alternative: Add directly to header
function add_analytics_inline() {
    echo '<script src="${scriptUrl}" data-tracking-code="${code}" defer></script>';
}
add_action('wp_head', 'add_analytics_inline');`,
    },
  }
}

export default function NewWebsitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [trackingCode, setTrackingCode] = useState<string | null>(null)
  const utils = api.useUtils()
  const createWebsite = api.websites.create.useMutation({
    onSuccess(data) {
      setTrackingCode(data.trackingCode)
      sileo.success({ title: 'Website added successfully!' })
      form.reset()
      utils.websites.optimized.invalidate()
    },
    onError(error) {
      sileo.error({ title: error.message || 'Failed to add website' })
    },
    onSettled() {
      setLoading(false)
    },
  })

  const form = useForm<WebsiteFormData>({
    resolver: zodResolver(websiteSchema),
    defaultValues: {
      name: '',
      url: '',
      description: '',
    },
  })

  const onSubmit = async (data: WebsiteFormData) => {
    setLoading(true)
    createWebsite.mutate(data)
  }

  const handleFinish = () => {
    router.push('/websites')
  }

  const { scriptUrl, code } = useMemo(
    () => (trackingCode ? parseTrackingScript(trackingCode) : { scriptUrl: '', code: '' }),
    [trackingCode],
  )

  const snippets = useMemo(
    () => (scriptUrl && code ? getSnippets(scriptUrl, code) : null),
    [scriptUrl, code],
  )

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/websites">
              <IconArrowLeft size={16} className="mr-2" />
              Back to Websites
            </Link>
          </Button>
        </div>

        {!trackingCode ? (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <IconGlobe size={20} />
                <span>Website Information</span>
              </CardTitle>
              <CardDescription>
                Enter the details of the website you want to track
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Website Name</Label>
                  <Input
                    id="name"
                    placeholder="My Awesome Website"
                    {...form.register('name')}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="url">Website URL</Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm select-none">
                      https://
                    </span>
                    <Input
                      id="url"
                      className="rounded-l-none"
                      placeholder="example.com"
                      {...form.register('url')}
                    />
                  </div>
                  {form.formState.errors.url && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.url.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of your website..."
                    rows={3}
                    {...form.register('description')}
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <Button type="button" variant="outline" asChild>
                    <Link href="/websites">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Adding...' : 'Add Website'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <IconCode size={20} />
                <span>Installation Instructions</span>
              </CardTitle>
              <CardDescription>
                Add the tracking script to your website to start collecting analytics.
                Choose your framework below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {snippets && (
                <Tabs defaultValue="html">
                  <TabsList className="flex-wrap">
                    {Object.entries(snippets).map(([key, { label }]) => (
                      <TabsTab key={key} value={key}>
                        {label}
                      </TabsTab>
                    ))}
                  </TabsList>

                  {Object.entries(snippets).map(([key, { language, snippet }]) => (
                    <TabsPanel key={key} value={key}>
                      <CodeBlock code={snippet} language={language} />
                    </TabsPanel>
                  ))}
                </Tabs>
              )}

              <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setTrackingCode(null)}>
                  Add Another Website
                </Button>
                <Button onClick={handleFinish}>
                  Finish
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}