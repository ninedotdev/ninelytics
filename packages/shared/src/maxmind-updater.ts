import path from 'node:path'
import { existsSync, statSync, mkdirSync, createWriteStream, renameSync, rmSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

// MAXMIND_DB_PATH should point to a directory that persists across deploys
// (e.g. /var/data/GeoLite2-City.mmdb on a VPS). Defaults to <project>/data/.
const MMDB_PATH = process.env.MAXMIND_DB_PATH ?? path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb')
const DATA_DIR = path.dirname(MMDB_PATH)
const MAX_AGE_DAYS = 6

function isDatabaseStale(): boolean {
  if (!existsSync(MMDB_PATH)) return true
  const { mtime } = statSync(MMDB_PATH)
  const ageMs = Date.now() - mtime.getTime()
  return ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}

function findMmdb(dir: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.endsWith('.mmdb')) return fullPath
    if (entry.isDirectory()) {
      const found = findMmdb(fullPath)
      if (found) return found
    }
  }
  return null
}

async function downloadDatabase(licenseKey: string): Promise<void> {
  const TMP_FILE = path.join(DATA_DIR, 'GeoLite2-City.tar.gz')
  mkdirSync(DATA_DIR, { recursive: true })

  const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${licenseKey}&suffix=tar.gz`

  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`MaxMind download failed: HTTP ${res.status}`)

  await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(TMP_FILE))

  execSync(`tar -xzf "${TMP_FILE}" -C "${DATA_DIR}"`, { stdio: 'pipe' })

  const extracted = findMmdb(DATA_DIR)
  if (!extracted) throw new Error('No .mmdb file found in MaxMind archive')

  if (extracted !== MMDB_PATH) renameSync(extracted, MMDB_PATH)

  rmSync(TMP_FILE, { force: true })

  // Remove extracted subdirectory if left behind
  for (const entry of readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) rmSync(path.join(DATA_DIR, entry.name), { recursive: true, force: true })
  }
}

export async function ensureMaxmindDatabase(): Promise<void> {
  const licenseKey = process.env.MAXMIND_LICENSE_KEY
  if (!licenseKey) {
    console.warn('[MaxMind] MAXMIND_LICENSE_KEY not set — geolocation will use ip-api.com fallback')
    return
  }

  if (!isDatabaseStale()) {
    console.log('[MaxMind] GeoLite2-City database is up to date')
    return
  }

  const reason = existsSync(MMDB_PATH) ? 'database is older than 30 days' : 'database not found'
  console.log(`[MaxMind] Downloading GeoLite2-City database (${reason})...`)

  try {
    await downloadDatabase(licenseKey)
    console.log('[MaxMind] GeoLite2-City database updated successfully')
  } catch (err) {
    console.error('[MaxMind] Failed to download database:', err)
    if (!existsSync(MMDB_PATH)) {
      console.warn('[MaxMind] Falling back to ip-api.com for geolocation')
    }
  }
}
