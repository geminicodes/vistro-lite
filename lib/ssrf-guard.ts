/**
 * SSRF (Server-Side Request Forgery) protection utilities
 * Prevents requests to private/internal network addresses
 */

const PRIVATE_IP_RANGES = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 private
  /^fe80:/, // IPv6 link-local
]

const BLOCKED_HOSTS = [
  "localhost",
  "0.0.0.0",
  "metadata.google.internal", // GCP metadata
  "169.254.169.254", // AWS/Azure metadata
]

export function isPrivateOrLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    // Check blocked hosts
    if (BLOCKED_HOSTS.includes(hostname)) {
      return true
    }

    // Check private IP ranges
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return true
      }
    }

    // Only allow http/https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true
    }

    return false
  } catch {
    return true // Treat invalid URLs as unsafe
  }
}
