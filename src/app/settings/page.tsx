'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { IconTrash, IconCopy, IconUnlink, IconEye, IconEyeOff, IconBrandGoogle, IconCircleCheck } from '@tabler/icons-react'
import { Telegram } from '@/components/icons/telegram'
import { Cloudflare } from '@/components/icons/cloudflare'
import { GoogleAnalytics } from '@/components/icons/google-analytics'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
} from '@/components/ui/alert-dialog'
import { sileo } from "sileo";
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AppLayout } from '@/components/layout/app-layout'
import { api } from '@/utils/trpc'

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  bio: z.string().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type ProfileFormData = z.infer<typeof profileSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

interface ApiKey {
  id: string
  name: string
  key: string
  scopes: string
  websiteId: string | null
  createdAt: string
  lastUsed: string | null
  expiresAt: string | null
}

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [loading, setLoading] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: session?.user?.name || '',
      email: session?.user?.email || '',
      bio: '',
    },
  })

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const { data: apiKeysData = [], refetch: refetchApiKeys } = api.settings.getApiKeys.useQuery()

  const updateProfile = api.settings.updateProfile.useMutation({
    onError: (error) => {
      sileo.error({ title: error.message || 'Failed to update profile' })
    },
  })

  const updatePassword = api.settings.updatePassword.useMutation({
    onError: (error) => {
      sileo.error({ title: error.message || 'Failed to update password' })
    },
  })

  useEffect(() => {
    if (apiKeysData.length > 0) {
      setApiKeys(apiKeysData)
    }
  }, [apiKeysData])

  useEffect(() => {
    if (session?.user) {
      profileForm.reset({
        name: session.user.name || '',
        email: session.user.email || '',
        bio: '',
      })
    }
  }, [session, profileForm])

  const onProfileSubmit = async (data: ProfileFormData) => {
    setLoading(true)
    try {
      const updatedUser = await updateProfile.mutateAsync(data)
      // Update form with saved values directly so the form reflects the new state
      profileForm.reset({
        name: updatedUser.name || data.name,
        email: updatedUser.email || data.email,
        bio: data.bio,
      })
      // Trigger session refresh (re-fetches from server)
      await update()
      sileo.success({ title: 'Profile updated successfully!' })
    } catch {
      // Error handling is done in mutation callback
    } finally {
      setLoading(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setLoading(true)
    try {
      await updatePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })
      passwordForm.reset()
      sileo.success({ title: 'Password updated successfully!' })
    } catch {
      // Error handling is done in mutation callback
    } finally {
      setLoading(false)
    }
  }

  const createApiKey = api.settings.createApiKey.useMutation({
    onSuccess: (newKey) => {
      setApiKeys([...apiKeys, newKey])
      sileo.success({ title: 'API key generated successfully!' })
    },
    onError: (error) => {
      sileo.error({ title: error.message || 'Failed to generate API key' })
    },
  })

  const generateApiKey = async () => {
    try {
      const name = prompt('Enter a name for this API key:')
      if (!name) return
      await createApiKey.mutateAsync({ name })
    } catch {
      // Error handling is done in mutation callback
    }
  }

  const deleteApiKeyMutation = api.settings.deleteApiKey.useMutation({
    onSuccess: () => {
      refetchApiKeys()
      sileo.success({ title: 'API key deleted successfully!' })
    },
    onError: (error) => {
      sileo.error({ title: error.message || 'Failed to delete API key' })
    },
  })

  const deleteApiKey = async (keyId: string) => {
    await deleteApiKeyMutation.mutateAsync({ id: keyId })
  }

  const copyApiKey = (key: string) => {
    navigator.clipboard.writeText(key)
    sileo.success({ title: 'API key copied to clipboard!' })
  }

  // Cloudflare integration
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const [cfToken, setCfToken] = useState('')
  const [cfSaving, setCfSaving] = useState(false)

  // Telegram
  const [tgBotToken, setTgBotToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const { data: tgPrefs, refetch: refetchTgPrefs } = api.uptime.getNotificationPrefs.useQuery()
  const pairTelegram = api.uptime.pairTelegram.useMutation({
    onSuccess(data) {
      sileo.success({ title: `Telegram connected via @${data.botUsername ?? 'bot'}` })
      setTgBotToken('')
      setTgChatId('')
      refetchTgPrefs()
    },
    onError(error) {
      sileo.error({ title: error.message || 'Failed to connect Telegram' })
    },
  })
  const unpairTelegram = api.uptime.unpairTelegram.useMutation({
    onSuccess() {
      sileo.success({ title: 'Telegram disconnected' })
      refetchTgPrefs()
    },
  })

  const { data: cfZones, refetch: refetchCfZones } = api.cloudflare.listZones.useQuery()

  const saveCfToken = api.cloudflare.saveToken.useMutation({
    onSuccess(result) {
      sileo.success({ title: `Cloudflare connected — ${result.zoneCount} zones found` })
      setCfToken('')
      setCfSaving(false)
      refetchCfZones()
    },
    onError(error) {
      sileo.error({ title: error.message || 'Invalid API token' })
      setCfSaving(false)
    },
  })

  const removeCfToken = api.cloudflare.removeToken.useMutation({
    onSuccess() {
      sileo.success({ title: 'Cloudflare disconnected' })
      refetchCfZones()
    },
    onError(error) {
      sileo.error({ title: error.message || 'Failed to disconnect' })
    },
  })

  // Google connection state (OAuth + legacy)
  const [gaCredentials, setGaCredentials] = useState('')
  const [gaSaving, setGaSaving] = useState(false)

  const { data: googleStatus, refetch: refetchGoogleStatus } = api.googleAnalytics.getConnectionStatus.useQuery()
  const { data: gaProperties, refetch: refetchGaProperties } = api.googleAnalytics.listProperties.useQuery()
  const { data: scSites } = api.searchConsole.listSites.useQuery()

  const saveGaCreds = api.googleAnalytics.saveCredentials.useMutation({
    onSuccess(data) {
      setGaSaving(false)
      setGaCredentials('')
      sileo.success({ title: `Google Analytics connected — ${data.propertyCount} properties found` })
      refetchGaProperties()
      refetchGoogleStatus()
    },
    onError(error) {
      setGaSaving(false)
      sileo.error({ title: error.message || 'Failed to connect' })
    },
  })

  const disconnectGoogle = api.googleAnalytics.disconnect.useMutation({
    onSuccess() {
      sileo.success({ title: 'Google disconnected' })
      refetchGoogleStatus()
      refetchGaProperties()
    },
    onError(error) {
      sileo.error({ title: error.message || 'Failed to disconnect' })
    },
  })

  // Keep legacy remove for backward compat
  const removeGaCreds = api.googleAnalytics.removeCredentials.useMutation({
    onSuccess() {
      sileo.success({ title: 'Google Analytics disconnected' })
      refetchGaProperties()
      refetchGoogleStatus()
    },
    onError(error) {
      sileo.error({ title: error.message || 'Failed to disconnect' })
    },
  })

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const maskApiKey = (key: string) => {
    return `${key.slice(0, 8)}...${key.slice(-4)}`
  }

  return (
    <AppLayout>
      <Tabs defaultValue="general" className="space-y-4">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── General Tab ─── */}
        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || undefined} />
                  <AvatarFallback className="bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 text-lg">
                    {session?.user?.name ? getInitials(session.user.name) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm">
                    Change Avatar
                  </Button>
                  <p className="text-sm text-muted-foreground mt-1">
                    JPG, GIF or PNG. 1MB max.
                  </p>
                </div>
              </div>

              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      {...profileForm.register('name')}
                    />
                    {profileForm.formState.errors.name && (
                      <p className="text-sm text-red-600">
                        {profileForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      {...profileForm.register('email')}
                    />
                    {profileForm.formState.errors.email && (
                      <p className="text-sm text-red-600">
                        {profileForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell us a little about yourself"
                    {...profileForm.register('bio')}
                  />
                </div>

                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Password Settings */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Password &amp; Security</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="flex-1 flex flex-col space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPw ? "text" : "password"}
                      {...passwordForm.register('currentPassword')}
                    />
                    <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showCurrentPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.currentPassword && (
                    <p className="text-sm text-red-600">{passwordForm.formState.errors.currentPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPw ? "text" : "password"}
                      {...passwordForm.register('newPassword')}
                    />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showNewPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.newPassword && (
                    <p className="text-sm text-red-600">{passwordForm.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPw ? "text" : "password"}
                      {...passwordForm.register('confirmPassword')}
                    />
                    <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirmPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-red-600">{passwordForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" disabled={loading} className="mt-auto self-start">
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          </div>
        </TabsContent>

        {/* ─── Integrations Tab ─── */}
        <TabsContent value="integrations" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Cloudflare Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Cloudflare</CardTitle>
              <CardDescription>
                Connect your Cloudflare account to import historical analytics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cfZones?.hasToken ? (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">
                      Connected
                    </span>
                    <span className="text-xs text-green-600 dark:text-green-400 ml-auto">
                      {cfZones.zones.length} zone{cfZones.zones.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Go to any website&apos;s settings to link a zone and sync data.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 w-full"
                    onClick={() => removeCfToken.mutate()}
                    disabled={removeCfToken.isPending}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cfToken">API Token</Label>
                    <Input
                      id="cfToken"
                      type="password"
                      value={cfToken}
                      onChange={(e) => setCfToken(e.target.value)}
                      placeholder="Your Cloudflare API token"
                    />
                    <p className="text-xs text-muted-foreground">
                      Create a token with Zone:Read + Analytics:Read permissions.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!cfToken.trim()) return
                      setCfSaving(true)
                      saveCfToken.mutate({ apiToken: cfToken.trim() })
                    }}
                    disabled={cfSaving || !cfToken.trim()}
                  >
                    {cfSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Cloudflare className="h-4 w-4 mr-2" />
                        Connect
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Google Integration (OAuth — GA4 + Search Console) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Google</CardTitle>
              <CardDescription>
                Connect your Google account for Analytics and Search Console access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {googleStatus?.hasOAuth ? (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">
                      Connected via OAuth
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {gaProperties?.properties && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">GA4 Properties</span>
                        <span className="font-medium">{gaProperties.properties.length}</span>
                      </div>
                    )}
                    {scSites?.sites && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Search Console Sites</span>
                        <span className="font-medium">{scSites.sites.length}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Go to any website&apos;s settings to link GA4 properties and Search Console sites.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 w-full"
                    onClick={() => disconnectGoogle.mutate()}
                    disabled={disconnectGoogle.isPending}
                  >
                    Disconnect Google
                  </Button>
                </>
              ) : googleStatus?.hasLegacy ? (
                <>
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Service Account (legacy)
                    </span>
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-auto">
                      {gaProperties?.properties.length ?? 0} propert{(gaProperties?.properties.length ?? 0) !== 1 ? 'ies' : 'y'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upgrade to OAuth to access Search Console and simplify your setup.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => { window.location.href = '/api/google/auth' }}
                    >
                      <IconBrandGoogle size={16} className="mr-2" />
                      Upgrade to OAuth
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => removeGaCreds.mutate()}
                      disabled={removeGaCreds.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Connect your Google account to import GA4 analytics and Search Console data.
                  </p>
                  <Button
                    className="w-full"
                    onClick={() => { window.location.href = '/api/google/auth' }}
                  >
                    <IconBrandGoogle size={16} className="mr-2" />
                    Connect with Google
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Requires <code className="text-xs">GOOGLE_API_CLIENT_ID</code> and <code className="text-xs">GOOGLE_API_CLIENT_SECRET</code> in your environment.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Telegram Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Telegram className="h-4 w-4" />
                Telegram
              </CardTitle>
              <CardDescription>
                Receive uptime alerts via Telegram bot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tgPrefs?.telegramChatId ? (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">Connected</span>
                    <span className="text-xs text-green-600 dark:text-green-400 ml-auto font-mono">
                      {tgPrefs.telegramChatId}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Uptime alerts will be sent to this Telegram chat.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 w-full"
                    onClick={() => unpairTelegram.mutate()}
                    disabled={unpairTelegram.isPending}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Create a bot via{' '}
                      <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a>,
                      then get your Chat ID from{' '}
                      <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline">@userinfobot</a>.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="tgBotToken" className="text-xs">Bot Token</Label>
                      <Input
                        id="tgBotToken"
                        type="password"
                        value={tgBotToken}
                        onChange={(e) => setTgBotToken(e.target.value)}
                        placeholder="123456:ABC-DEF..."
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tgChatId" className="text-xs">Chat ID</Label>
                      <Input
                        id="tgChatId"
                        value={tgChatId}
                        onChange={(e) => setTgChatId(e.target.value)}
                        placeholder="123456789"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => pairTelegram.mutate({ botToken: tgBotToken, chatId: tgChatId })}
                    disabled={!tgBotToken.trim() || !tgChatId.trim() || pairTelegram.isPending}
                  >
                    {pairTelegram.isPending ? (
                      <><Spinner className="h-4 w-4 mr-2" /> Verifying...</>
                    ) : (
                      <><Telegram className="h-4 w-4 mr-2" /> Connect & Test</>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          </div>
        </TabsContent>

        {/* ─── Advanced Tab ─── */}
        <TabsContent value="advanced" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
          {/* API Keys */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">API Keys</CardTitle>
                  <CardDescription>
                    Manage API keys for programmatic access
                  </CardDescription>
                </div>
                <Button onClick={generateApiKey} size="sm">Generate Key</Button>
              </div>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No API keys yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{apiKey.name}</span>
                          <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{maskApiKey(apiKey.key)}</code>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {new Date(apiKey.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyApiKey(apiKey.key)}>
                          <IconCopy size={16} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600"><IconTrash size={16} /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteApiKey(apiKey.id)} variant="destructive">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex justify-center">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Account</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete your account? This action cannot be undone.
                      All your websites, analytics data, and settings will be permanently deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive">
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  )
}