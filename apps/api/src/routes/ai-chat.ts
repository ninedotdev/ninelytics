/**
 * AI chat endpoint — streams responses from OpenAI / Anthropic / Google
 * via @ai-sdk, with a system prompt that teaches the model to emit
 * [CHART_DATA]...[/CHART_DATA] blocks the frontend renders as charts.
 *
 * Faithful port of src/app/api/ai-chat/route.ts from the Next app.
 */
import { Hono } from 'hono'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { getSession } from '@/lib/session'

export const aiChat = new Hono()

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY || '' })

const REASONING_MODELS = new Set([
  'gpt-5.4-mini',
  'gpt-5.3',
  'gpt-5.4',
  'gemini-3.1-flash-lite',
])

const SUPPORTED_MODELS: Record<string, () => unknown> = {
  'gpt-5.4-mini': () => openai('gpt-5.4-mini'),
  'gpt-5.3': () => openai('gpt-5.3'),
  'gpt-5.4': () => openai('gpt-5.4'),
  'claude-sonnet-4-6': () => anthropic('claude-sonnet-4-6'),
  'claude-opus-4-6': () => anthropic('claude-opus-4-6'),
  'gemini-3.1-flash-lite': () => google('gemini-3.1-flash-lite-preview'),
}

const CHART_INSTRUCTIONS = `
When the user asks for a chart, graph, or visualization, output a JSON chart spec wrapped in [CHART_DATA] and [/CHART_DATA] delimiters.

CHART TYPES:
- "area" — line/area chart for time series (visitors over time, trends)
- "bar" — bar chart for comparisons (top pages, sources, by day of week)
- "ring" — donut/ring chart for proportions (device breakdown, traffic sources %)

FORMAT — output valid JSON between the delimiters:

[CHART_DATA]
{
  "type": "area",
  "title": "Visitors by Day",
  "xKey": "date",
  "keys": ["visitors"],
  "data": [
    {"date": "2026-03-18", "visitors": 120},
    {"date": "2026-03-19", "visitors": 95}
  ]
}
[/CHART_DATA]

RULES:
- "type" must be "area", "bar", or "ring"
- "data" must be an array of objects
- "keys" lists the data keys to plot (e.g. ["visitors", "pageViews"])
- "xKey" is the category/date field name (default: "date" for area, "name" for bar/ring)
- For ring charts: each item needs "name", "value", and "total" (usually 100 for percentages)
- Use the actual data from the analytics context provided above
- Add a brief text explanation before the [CHART_DATA] block
- NEVER output raw SVG, HTML, or markdown tables for visualizations — always use [CHART_DATA]

EXAMPLES:

Bar chart of top pages:
[CHART_DATA]
{"type":"bar","title":"Top Pages","xKey":"name","keys":["views"],"data":[{"name":"/","views":450},{"name":"/about","views":120}]}
[/CHART_DATA]

Ring chart of devices:
[CHART_DATA]
{"type":"ring","title":"Device Breakdown","xKey":"name","keys":["value"],"data":[{"name":"Desktop","value":65,"total":100},{"name":"Mobile","value":30,"total":100},{"name":"Tablet","value":5,"total":100}]}
[/CHART_DATA]`

aiChat.post('/', async (c) => {
  const session = await getSession(c.req.raw)
  if (!session?.user) return c.body('Unauthorized', 401)

  let body: {
    messages: UIMessage[]
    analyticsContext?: string
    model?: string
  }
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const { messages, analyticsContext = '', model: modelId } = body

  const resolvedModelId = modelId && SUPPORTED_MODELS[modelId] ? modelId : 'gpt-5.4-mini'
  const modelFactory = SUPPORTED_MODELS[resolvedModelId]!
  const isReasoning = REASONING_MODELS.has(resolvedModelId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = streamText({
    model: modelFactory() as never,
    system: `You are an expert web analytics consultant. The user is asking questions about their website analytics data.

${analyticsContext}

Guidelines:
- Be concise and direct — 2-4 sentences max unless a longer answer is clearly needed
- Focus on actionable insights the user can act on
- Use plain text only for analysis — no markdown, no asterisks, no bullet markers
- Use numbers and percentages when they add value
- If you don't have enough data to answer confidently, say so briefly
${CHART_INSTRUCTIONS}`,
    messages: await convertToModelMessages(messages),
    ...(isReasoning ? {} : { temperature: 0.6 }),
  })

  return result.toUIMessageStreamResponse()
})
