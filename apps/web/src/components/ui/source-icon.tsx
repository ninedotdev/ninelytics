
import type { ComponentType, SVGProps } from "react"
import { Bing } from "@/components/icons/referals/bing"
import { OpenAI as ChatGPT } from "@/components/icons/referals/chatgpt"
import { DuckDuckGo } from "@/components/icons/referals/duckduckgo"
import { Facebook } from "@/components/icons/referals/facebook"
import { GitHub } from "@/components/icons/referals/github"
import { Google } from "@/components/icons/referals/google"
import { Instagram } from "@/components/icons/referals/instagram"
import { LinkedIn } from "@/components/icons/referals/linkedin"
import { PerplexityAI as Perplexity } from "@/components/icons/referals/perplexity"
import { Pinterest } from "@/components/icons/referals/pinterest"
import { ProductHunt } from "@/components/icons/referals/producthunt"
import { Reddit } from "@/components/icons/referals/reddit"
import { TikTok } from "@/components/icons/referals/tiktok"
import { XformerlyTwitter as Twitter } from "@/components/icons/referals/twitter"
import { X } from "@/components/icons/referals/x"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const SOURCE_MAP: Record<string, IconComponent> = {
  // Search engines
  google: Google,
  "google.com": Google,
  organic: Google,
  bing: Bing,
  "bing.com": Bing,
  duckduckgo: DuckDuckGo,
  "duckduckgo.com": DuckDuckGo,
  // Social
  facebook: Facebook,
  "facebook.com": Facebook,
  "m.facebook.com": Facebook,
  "l.facebook.com": Facebook,
  twitter: Twitter,
  "twitter.com": Twitter,
  "t.co": Twitter,
  x: X,
  "x.com": X,
  linkedin: LinkedIn,
  "linkedin.com": LinkedIn,
  "lnkd.in": LinkedIn,
  reddit: Reddit,
  "reddit.com": Reddit,
  "old.reddit.com": Reddit,
  instagram: Instagram,
  "instagram.com": Instagram,
  pinterest: Pinterest,
  "pinterest.com": Pinterest,
  tiktok: TikTok,
  "tiktok.com": TikTok,
  github: GitHub,
  "github.com": GitHub,
  // AI / Chat
  gpt: ChatGPT,
  chatgpt: ChatGPT,
  "chatgpt.com": ChatGPT,
  "chat.openai.com": ChatGPT,
  perplexity: Perplexity,
  "perplexity.ai": Perplexity,
  // Platforms
  producthunt: ProductHunt,
  "producthunt.com": ProductHunt,
}

function resolveIcon(source: string): IconComponent | null {
  let lower = source.toLowerCase().trim()
  try {
    if (lower.startsWith("http")) lower = new URL(lower).hostname
  } catch { /* not a URL */ }
  lower = lower.replace(/^www\./, "")

  // 1) exact hit
  if (SOURCE_MAP[lower]) return SOURCE_MAP[lower]!

  // 2) suffix match on dotted keys only — so "m.facebook.com" resolves to
  //    the facebook.com entry, but a random host like "mdctaxcollector.gov"
  //    doesn't catch the 'x' key just because it contains the letter x.
  for (const [key, icon] of Object.entries(SOURCE_MAP)) {
    if (!key.includes(".")) continue
    if (lower === key || lower.endsWith("." + key)) return icon
  }
  return null
}

interface SourceIconProps {
  source: string
  size?: number
  className?: string
}

export function SourceIcon({ source, size = 16, className = "" }: SourceIconProps) {
  const Icon = resolveIcon(source)
  if (!Icon) return null

  return <Icon width={size} height={size} className={`shrink-0 ${className}`} />
}
