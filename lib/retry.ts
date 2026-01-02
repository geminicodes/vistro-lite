/**
 * Exponential backoff retry utility for DeepL API calls
 * Handles rate limits (429) and server errors (5xx)
 */

interface RetryOptions {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
}

/**
 * Retries a function with exponential backoff
 * Delay formula: min(initialDelay × 2^attempt, maxDelay)
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 1000, maxDelayMs = 30000 } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break
      }

      // Check if error is retryable
      const isRetryable = isRetryableError(error)
      if (!isRetryable) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs)

      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms`)

      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Determines if an error should trigger a retry
 */
function isRetryableError(error: unknown): boolean {
  // Check if error has a response object with status code (from fetch)
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status

    // Retry on rate limits
    if (status === 429) {
      return true
    }

    // Retry on server errors (5xx)
    if (status >= 500 && status < 600) {
      return true
    }
  }

  // Fallback to message checking for other error types
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    // Retry on rate limits
    if (message.includes("429") || message.includes("rate limit")) {
      return true
    }

    // Retry on server errors (5xx)
    if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
      return true
    }

    // Retry on timeout
    if (message.includes("timeout") || message.includes("timed out")) {
      return true
    }

    // Retry on network errors
    if (message.includes("network") || message.includes("econnreset") || message.includes("econnrefused")) {
      return true
    }
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
