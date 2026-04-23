import { isIPv4 } from 'node:net'

/**
 * IP blocking with CIDR support.
 * Set IGNORE_IP env var with comma-separated IPs or CIDR ranges:
 *   IGNORE_IP="192.168.1.1,10.0.0.0/8,203.0.113.0/24"
 */

interface CIDRRange {
  ip: number
  mask: number
}

let parsedRanges: CIDRRange[] | null = null
let parsedExactIps: Set<string> | null = null

function ipToNumber(ip: string): number {
  const parts = ip.split('.')
  return ((parseInt(parts[0]) << 24) | (parseInt(parts[1]) << 16) | (parseInt(parts[2]) << 8) | parseInt(parts[3])) >>> 0
}

function parseCIDR(cidr: string): CIDRRange | null {
  const [ip, bits] = cidr.split('/')
  if (!ip || !bits || !isIPv4(ip)) return null
  const maskBits = parseInt(bits, 10)
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return null
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0
  return { ip: ipToNumber(ip) & mask, mask }
}

function parseIgnoreList() {
  if (parsedRanges !== null) return

  parsedRanges = []
  parsedExactIps = new Set()

  const ignoreIp = process.env.IGNORE_IP
  if (!ignoreIp) return

  const entries = ignoreIp.split(',').map((s) => s.trim()).filter(Boolean)

  for (const entry of entries) {
    if (entry.includes('/')) {
      const range = parseCIDR(entry)
      if (range) parsedRanges.push(range)
    } else {
      parsedExactIps.add(entry)
    }
  }
}

export function isIpBlocked(ip: string): boolean {
  if (!process.env.IGNORE_IP) return false

  parseIgnoreList()

  if (parsedExactIps!.has(ip)) return true

  if (isIPv4(ip)) {
    const ipNum = ipToNumber(ip)
    for (const range of parsedRanges!) {
      if ((ipNum & range.mask) === range.ip) return true
    }
  }

  return false
}
