/**
 * Ad-hoc workflow trigger queue. Separate from tracking:jobs so the
 * semantics don't get tangled (tracking is high-rate events, workflow
 * is occasional triggers like "index this sitemap now" or "check this
 * site's uptime now").
 *
 * Producer: apps/api (tRPC routers enqueue on user action).
 * Consumer: apps/worker (drains and runs the corresponding handler).
 */
import { redis } from './redis'

const WORKFLOW_QUEUE_KEY = 'jobs:workflow'

export type WorkflowJob =
  | { kind: 'uptime-check'; websiteId: string }
  | { kind: 'sitemap-poll'; websiteId: string }

export async function enqueueWorkflowJob(job: WorkflowJob): Promise<void> {
  await redis.lpush(WORKFLOW_QUEUE_KEY, JSON.stringify(job))
}

export async function dequeueWorkflowJob(
  blockSeconds = 5,
): Promise<WorkflowJob | null> {
  const result = await redis.brpop(WORKFLOW_QUEUE_KEY, blockSeconds)
  if (!result || result.length < 2 || !result[1]) return null
  return JSON.parse(result[1]) as WorkflowJob
}

export function getWorkflowQueueKey(): string {
  return WORKFLOW_QUEUE_KEY
}
