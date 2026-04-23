export function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const maybeError = error as { name?: string; message?: string; code?: string }
  const message = (maybeError.message || "").toLowerCase()
  const name = (maybeError.name || "").toLowerCase()

  return (
    maybeError.code === "ECONNRESET" ||
    name === "aborterror" ||
    message.includes("aborted") ||
    message.includes("request aborted") ||
    message.includes("body stream already read")
  )
}
