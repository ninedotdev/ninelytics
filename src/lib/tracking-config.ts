const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const TRACKING_CONFIG = {
  batchConcurrency: toInt(process.env.TRACKING_BATCH_CONCURRENCY, 5),
  notifyGoalsAsync: process.env.TRACKING_NOTIFY_GOALS_ASYNC !== "false",
}
