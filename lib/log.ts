/**
 * Structured logging utility for Vercel serverless environment
 * Prevents accidental logging of sensitive data like full HTML or tokens
 */

type LogLevel = "info" | "warn" | "error" | "debug"

interface LogContext {
  [key: string]: unknown
}

function formatLog(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString()
  const sanitized = sanitizeContext(context)

  return JSON.stringify({
    timestamp,
    level,
    message,
    ...sanitized,
  })
}

function sanitizeContext(context?: LogContext): LogContext {
  if (!context) return {}

  const sanitized: LogContext = {}

  for (const [key, value] of Object.entries(context)) {
    // Check for sensitive fields using multiple patterns
    const lowerKey = key.toLowerCase()
    const isSensitive =
      lowerKey === "html" ||
      lowerKey === "password" ||
      lowerKey === "token" ||
      lowerKey === "authorization" ||
      lowerKey.endsWith("_key") ||
      lowerKey.endsWith("_secret") ||
      lowerKey.endsWith("_token") ||
      lowerKey.includes("api_key") ||
      lowerKey.includes("apikey") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("password") ||
      lowerKey.includes("auth")

    if (isSensitive) {
      sanitized[key] = "[REDACTED]"
      continue
    }

    // Truncate long strings
    if (typeof value === "string" && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + "...[truncated]"
      continue
    }

    sanitized[key] = value
  }

  return sanitized
}

export const log = {
  info(message: string, context?: LogContext) {
    console.log(formatLog("info", message, context))
  },

  warn(message: string, context?: LogContext) {
    console.warn(formatLog("warn", message, context))
  },

  error(message: string, context?: LogContext) {
    console.error(formatLog("error", message, context))
  },

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === "development") {
      console.log(formatLog("debug", message, context))
    }
  },
}
