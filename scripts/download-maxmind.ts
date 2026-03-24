/**
 * Downloads GeoLite2-City.mmdb from MaxMind using MAXMIND_LICENSE_KEY.
 * Run with: npm run db:maxmind
 */

import { execSync } from 'node:child_process'
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs'
import { readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const MAX_AGE_DAYS = 6 // GeoLite2 updates twice a week — re-download after 6 days

import "dotenv/config"

const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY

if (!LICENSE_KEY) {
  console.error('Error: MAXMIND_LICENSE_KEY is not set in environment')
  process.exit(1)
}

// MAXMIND_DB_PATH lets you store the MMDB outside the project directory
// so it survives deploys. Defaults to <project>/data/GeoLite2-City.mmdb.
const OUTPUT_FILE = process.env.MAXMIND_DB_PATH ?? join(process.cwd(), 'data', 'GeoLite2-City.mmdb')
const DATA_DIR = join(OUTPUT_FILE, '..')
const TMP_FILE = join(DATA_DIR, 'GeoLite2-City.tar.gz')

async function findMmdb(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isFile() && entry.name.endsWith('.mmdb')) return fullPath
    if (entry.isDirectory()) {
      const found = await findMmdb(fullPath)
      if (found) return found
    }
  }
  return null
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true })

  // Skip download if the file exists and is fresh enough
  try {
    const stat = statSync(OUTPUT_FILE)
    const ageMs = Date.now() - stat.mtimeMs
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays < MAX_AGE_DAYS) {
      console.log(`GeoLite2-City.mmdb is ${ageDays.toFixed(1)} days old — skipping download (max ${MAX_AGE_DAYS} days)`)
      return
    }
    console.log(`GeoLite2-City.mmdb is ${ageDays.toFixed(1)} days old — updating...`)
  } catch {
    // File doesn't exist yet — proceed with download
  }

  const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz`

  console.log('Downloading GeoLite2-City database from MaxMind...')
  const res = await fetch(url)

  if (!res.ok) {
    const body = await res.text()
    console.error(`Download failed: HTTP ${res.status}`)
    console.error(body)
    process.exit(1)
  }

  await pipeline(Readable.fromWeb(res.body as Parameters<typeof pipeline>[0]), createWriteStream(TMP_FILE))
  console.log(`Downloaded archive to ${TMP_FILE}`)

  console.log('Extracting...')
  execSync(`tar -xzf "${TMP_FILE}" -C "${DATA_DIR}"`, { stdio: 'inherit' })

  const mmdbPath = await findMmdb(DATA_DIR)
  if (!mmdbPath) {
    console.error('No .mmdb file found in extracted archive')
    process.exit(1)
  }

  if (mmdbPath !== OUTPUT_FILE) {
    await rename(mmdbPath, OUTPUT_FILE)
  }

  rmSync(TMP_FILE)

  // Clean up extracted directory (keep only the .mmdb)
  const entries = await readdir(DATA_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      rmSync(join(DATA_DIR, entry.name), { recursive: true, force: true })
    }
  }

  console.log(`MaxMind GeoLite2-City database saved to: ${OUTPUT_FILE}`)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
