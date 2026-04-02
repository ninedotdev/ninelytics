import redis from "@/lib/redis"
import { createRequestContextFromHeaders, processEvent, type CollectPayload } from "@/lib/collect"
import { processConversionPayload, type ConversionPayload } from "@/lib/tracking-conversion"

const TRACKING_QUEUE_KEY = "tracking:jobs"

const GEO_HEADER_NAMES = [
  "cf-ipcountry",
  "cf-region-code",
  "cf-ipcity",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
  "x-vercel-ip-city",
  "cloudfront-viewer-country",
  "cloudfront-viewer-country-region",
  "cloudfront-viewer-city",
] as const

export interface SerializedRequestContext {
  ipAddress: string
  headerUserAgent: string
  headers: Record<string, string>
}

export type TrackingJob =
  | { kind: "collect"; payload: CollectPayload; context: SerializedRequestContext }
  | { kind: "conversion"; payload: ConversionPayload }

export function serializeTrackingRequestContext(headers: Headers): SerializedRequestContext {
  const serializedHeaders: Record<string, string> = {}

  for (const headerName of GEO_HEADER_NAMES) {
    const value = headers.get(headerName)
    if (value) serializedHeaders[headerName] = value
  }

  return {
    ipAddress:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "unknown",
    headerUserAgent: headers.get("user-agent") || "unknown",
    headers: serializedHeaders,
  }
}

export async function enqueueTrackingJob(job: TrackingJob) {
  await redis.lpush(TRACKING_QUEUE_KEY, JSON.stringify(job))
}

export async function dequeueTrackingJob(blockSeconds = 5): Promise<TrackingJob | null> {
  const result = await redis.brpop(TRACKING_QUEUE_KEY, blockSeconds)
  if (!result || result.length < 2 || !result[1]) return null
  return JSON.parse(result[1]) as TrackingJob
}

export async function processTrackingJob(job: TrackingJob) {
  if (job.kind === "collect") {
    const ctx = createRequestContextFromHeaders(
      job.context.ipAddress,
      job.context.headerUserAgent,
      job.context.headers
    )
    return processEvent(job.payload, ctx)
  }

  return processConversionPayload(job.payload)
}

export function getTrackingQueueKey() {
  return TRACKING_QUEUE_KEY
}
