/**
 * Cloudflare Managed Transforms — programmatic toggle for the
 * "Add visitor location headers" managed transform. Enabling it makes CF
 * send `cf-ipcity`, `cf-region`, `cf-region-code`, `cf-postal-code`,
 * `cf-iplatitude`, `cf-iplongitude`, and `cf-timezone` to the origin in
 * addition to the always-on `cf-ipcountry`. The geolocation service in
 * this repo already reads these headers in `getLocationFromHeaders()`.
 *
 * Available on every CF plan including Free.
 * Requires API token with `Zone → Transform Rules → Edit` (or Zone:Edit).
 *
 * Docs: https://developers.cloudflare.com/rules/transform/managed-transforms/reference/
 */

const MANAGED_HEADER_ID = 'add_visitor_location_headers'
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

interface ManagedHeader {
  id: string
  enabled: boolean
  has_conflict?: boolean
}

interface ManagedHeadersResponse {
  success: boolean
  errors?: Array<{ code: number; message: string }>
  result: {
    managed_request_headers: ManagedHeader[]
    managed_response_headers: ManagedHeader[]
  }
}

function describeError(json: ManagedHeadersResponse | null, status: number): string {
  const first = json?.errors?.[0]
  if (first) return `CF API ${status}: [${first.code}] ${first.message}`
  return `CF API ${status}`
}

/**
 * Returns whether the visitor-location-headers managed transform is currently
 * enabled on the given zone. Returns null if the transform isn't listed at all
 * (which shouldn't happen for valid zones, but signals a misconfigured token).
 */
export async function getVisitorLocationHeadersStatus(
  zoneId: string,
  apiToken: string,
): Promise<boolean | null> {
  const res = await fetch(`${CF_API_BASE}/zones/${zoneId}/managed_headers`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    signal: AbortSignal.timeout(10_000),
  })

  let json: ManagedHeadersResponse | null = null
  try { json = (await res.json()) as ManagedHeadersResponse } catch { /* non-JSON body */ }

  if (!res.ok || !json?.success) throw new Error(describeError(json, res.status))

  const entry = json.result.managed_request_headers.find((h) => h.id === MANAGED_HEADER_ID)
  return entry?.enabled ?? null
}

/**
 * Toggles the visitor-location-headers managed transform on the given zone.
 * Idempotent — re-sending the same value is a no-op on Cloudflare's side.
 */
export async function setVisitorLocationHeadersEnabled(
  zoneId: string,
  apiToken: string,
  enabled: boolean,
): Promise<void> {
  const res = await fetch(`${CF_API_BASE}/zones/${zoneId}/managed_headers`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      managed_request_headers: [{ id: MANAGED_HEADER_ID, enabled }],
    }),
    signal: AbortSignal.timeout(10_000),
  })

  let json: ManagedHeadersResponse | null = null
  try { json = (await res.json()) as ManagedHeadersResponse } catch { /* non-JSON body */ }

  if (!res.ok || !json?.success) throw new Error(describeError(json, res.status))
}
