"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/utils/trpc";
import {
  IconChartDots3,
  IconChevronDown,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";

// ai-elements
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

import { AreaChart, Area } from "@/components/charts/area-chart";
import BarChart from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import RingChart from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { CountryFlag } from "@/components/ui/country-flag";

import type {
  Anomaly,
  Recommendation,
  Prediction,
  AIInsight,
} from "@/types/ai";

// ─── Config ──────────────────────────────────────────────────────────────────

interface Website { id: string; name: string; url: string }

const MODELS = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai" as const, fast: true },
  { id: "gpt-5.3", label: "GPT-5.3", provider: "openai" as const },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai" as const },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" as const },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic" as const },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", provider: "google" as const, fast: true },
];

const QUICK_PROMPTS = [
  "Show me a chart of visitors by day",
  "What's driving my bounce rate?",
  "Which pages need improvement?",
  "Chart my top traffic sources",
  "How can I grow traffic?",
  "Visualize device breakdown",
];

function sanitizeInitialSummary(summary: string): string {
  return summary
    .replace(/(?:SEO INSIGHTS|SPEED INSIGHTS):\s*(?=(?:SEO INSIGHTS:|SPEED INSIGHTS:|$))/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Task loading panel ───────────────────────────────────────────────────────

interface LoadingTasksProps {
  hasRevenue: boolean;
  hasSearchConsole: boolean;
  hasSpeedInsights: boolean;
  hasSitemap: boolean;
}

function LoadingTasks({ hasRevenue, hasSearchConsole, hasSpeedInsights, hasSitemap }: LoadingTasksProps) {
  const tasks = [
    { key: "analytics", title: "Reading analytics data", items: ["Page views, visitors & session metrics", "Bounce rate & engagement signals", "Device & location breakdown"] },
    ...(hasRevenue ? [{ key: "revenue", title: "Reading revenue data", items: ["Transaction history & totals", "New vs returning customer revenue"] }] : []),
    ...(hasSearchConsole ? [{ key: "gsc", title: "Reading Search Console data", items: ["Impressions, clicks & CTR", "Top queries & ranking positions"] }] : []),
    ...(hasSpeedInsights ? [{ key: "speed", title: "Reading Speed Insights", items: ["Core Web Vitals (LCP, INP, CLS, TTFB)", "Real Experience Score"] }] : []),
    ...(hasSitemap ? [{ key: "sitemap", title: "Reading Sitemap status", items: ["Indexed & pending pages", "Google submission status", "IndexNow delivery"] }] : []),
    { key: "ai", title: "Generating AI insights", items: ["Identifying patterns & anomalies", "Preparing recommendations"] },
  ];

  return (
    <div className="space-y-3 p-2">
      {tasks.map((task, i) => (
        <Task key={task.key} defaultOpen={i === 0}>
          <TaskTrigger title={task.title} />
          <TaskContent>
            {task.items.map((item) => (
              <TaskItem key={item}>
                <Shimmer duration={2 + i * 0.3}>{item}</Shimmer>
              </TaskItem>
            ))}
          </TaskContent>
        </Task>
      ))}
    </div>
  );
}

// ─── Chart data types & parser ───────────────────────────────────────────────

interface ChartData {
  type: "area" | "bar" | "ring";
  title?: string;
  data: Record<string, unknown>[];
  keys: string[];
  xKey?: string;
  colors?: string[];
}

type TextSegment = { type: "text"; content: string };
type ChartSegment = { type: "chart"; chart: ChartData };
type Segment = TextSegment | ChartSegment;

function hasPendingChart(text: string): boolean {
  const opens = (text.match(/\[CHART_DATA\]/g) || []).length;
  const closes = (text.match(/\[\/CHART_DATA\]/g) || []).length;
  return opens > closes;
}

function textBeforeChart(text: string): string {
  const idx = text.lastIndexOf("[CHART_DATA]");
  if (idx >= 0) return text.slice(0, idx).trim();
  return text;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\[CHART_DATA\]\s*([\s\S]*?)\s*\[\/CHART_DATA\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }
    try {
      const chart = JSON.parse(match[1]!.trim()) as ChartData;
      if (chart.type && chart.data) {
        segments.push({ type: "chart", chart });
      } else {
        segments.push({ type: "text", content: match[0]! });
      }
    } catch {
      segments.push({ type: "text", content: match[0]! });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex).trim();
    if (rest) segments.push({ type: "text", content: rest });
  }
  return segments.length ? segments : [{ type: "text", content: text }];
}

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Truncate long labels (URLs, etc.) */
function truncLabel(label: string, max = 20): string {
  if (label.length <= max) return label;
  // For URLs, show last path segment
  if (label.startsWith("/") || label.startsWith("http")) {
    const parts = label.replace(/^https?:\/\//, "").split("/").filter(Boolean);
    const last = parts.at(-1) || label;
    return last.length > max ? `...${last.slice(-max + 3)}` : `/${last}`;
  }
  return `${label.slice(0, max - 1)}...`;
}

/** Ensure all numeric values are non-negative */
function sanitizeChartData(data: Record<string, unknown>[], keys: string[]): Record<string, unknown>[] {
  return data.map((d) => {
    const clean = { ...d };
    for (const key of keys) {
      const val = Number(clean[key] ?? 0);
      clean[key] = Math.max(0, isFinite(val) ? val : 0);
    }
    return clean;
  });
}

/** Detect if chart data represents countries */
function isCountryChart(chart: ChartData): boolean {
  const title = (chart.title || "").toLowerCase();
  if (/countr|geo|region|location/i.test(title)) return true;
  const xKey = chart.xKey || "name";
  const labels = chart.data.slice(0, 3).map((d) => String(d[xKey] ?? ""));
  // Country codes are 2 chars, or common country names
  return labels.every((l) => l.length === 2 || /united|china|germany|brazil|india|japan|korea|france|canada|australia|mexico|singapore|argentina/i.test(l));
}

function CountryBarList({ chart }: { chart: ChartData }) {
  const xKey = chart.xKey || "name";
  const valueKey = chart.keys[0] || "value";
  const items = chart.data.slice(0, 10).map((d) => ({
    name: String(d[xKey] ?? ""),
    value: Math.max(0, Number(d[valueKey] ?? 0)),
  }));
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-2.5">
          <CountryFlag countryName={item.name} countryCode={item.name.length === 2 ? item.name : undefined} size={18} />
          <span className="text-sm text-foreground w-16 shrink-0 truncate">{item.name}</span>
          <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm bg-[var(--chart-1)]"
              style={{ width: `${(item.value / maxVal) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function AIChart({ chart }: { chart: ChartData }) {
  const colors = chart.colors?.length ? chart.colors : CHART_COLORS;

  // Country data → custom list with flags
  if (chart.type === "bar" && isCountryChart(chart)) {
    return <CountryBarList chart={chart} />;
  }

  if (chart.type === "ring") {
    const ringData = chart.data.slice(0, 6).map((d, i) => ({
      label: String(d[chart.xKey || "name"] ?? d.label ?? `Item ${i + 1}`),
      value: Math.max(0, Number(d[chart.keys[0] || "value"] ?? 0)),
      maxValue: Math.max(1, Number(d.total ?? d.maxValue ?? 100)),
      color: colors[i % colors.length]!,
    }));
    return (
      <RingChart data={ringData} className="mx-auto" size={200}>
        {ringData.map((_, i) => <Ring key={i} index={i} />)}
        <RingCenter />
      </RingChart>
    );
  }

  if (chart.type === "bar") {
    const xKey = chart.xKey || "name";
    // Limit to 10 bars max, truncate labels, ensure positive values
    const barData = sanitizeChartData(chart.data.slice(0, 10), chart.keys).map((d) => ({
      ...d,
      [xKey]: truncLabel(String(d[xKey] ?? "")),
    }));
    return (
      <BarChart data={barData} xDataKey={xKey} aspectRatio="2.5 / 1">
        <Grid horizontal numTicksRows={4} />
        {chart.keys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={colors[i % colors.length]} />
        ))}
        <BarXAxis showAllLabels maxLabels={10} />
        <ChartTooltip rows={(point) =>
          chart.keys.map((key, i) => ({
            color: colors[i % colors.length]!,
            label: key,
            value: Number(point[key] ?? 0).toLocaleString(),
          }))
        } />
      </BarChart>
    );
  }

  // Default: area chart
  const xKey = chart.xKey || "date";
  const areaData = sanitizeChartData(chart.data, chart.keys).map((d) => ({
    ...d,
    [xKey]: d[xKey] instanceof Date ? d[xKey] : new Date(String(d[xKey])),
  }));

  return (
    <AreaChart data={areaData} aspectRatio="2.5 / 1">
      <Grid horizontal numTicksRows={4} />
      {chart.keys.map((key, i) => (
        <Area key={key} dataKey={key} fill={colors[i % colors.length]} strokeWidth={2} />
      ))}
      <XAxis />
      <ChartTooltip rows={(point) =>
        chart.keys.map((key, i) => ({
          color: colors[i % colors.length]!,
          label: key,
          value: Number(point[key] ?? 0).toLocaleString(),
        }))
      } />
    </AreaChart>
  );
}

// ─── Streaming placeholders ──────────────────────────────────────────────────

function ThinkingTasks({ query }: { query: string }) {
  const lowerQuery = query.toLowerCase();
  const isChart = /chart|graph|visual|plot|show me/i.test(lowerQuery);
  const isSeo = /seo|search|sitemap|index|ranking|keyword/i.test(lowerQuery);
  const isSpeed = /speed|performance|lcp|fcp|cls|vitals|load/i.test(lowerQuery);
  const isTraffic = /traffic|source|referr|visit|growth/i.test(lowerQuery);

  return (
    <div className="space-y-2 py-1">
      <Task defaultOpen>
        <TaskTrigger title={isChart ? "Preparing visualization" : "Analyzing your question"} />
        <TaskContent>
          {isTraffic && <TaskItem><Shimmer duration={1.6}>Reviewing traffic sources & trends</Shimmer></TaskItem>}
          {isSeo && <TaskItem><Shimmer duration={1.8}>Checking sitemap & indexing status</Shimmer></TaskItem>}
          {isSpeed && <TaskItem><Shimmer duration={2.0}>Evaluating Core Web Vitals</Shimmer></TaskItem>}
          {isChart && <TaskItem><Shimmer duration={2.2}>Building chart from analytics data</Shimmer></TaskItem>}
          {!isChart && !isSeo && !isSpeed && !isTraffic && (
            <TaskItem><Shimmer duration={1.8}>Reading analytics context</Shimmer></TaskItem>
          )}
          <TaskItem><Shimmer duration={2.4}>Generating response</Shimmer></TaskItem>
        </TaskContent>
      </Task>
    </div>
  );
}

function ChartStreamingPlaceholder() {
  return (
    <div className="rounded-xl border bg-background p-4 w-full">
      <Task defaultOpen>
        <TaskTrigger title="Generating visualization" />
        <TaskContent>
          <TaskItem><Shimmer duration={1.8}>Analyzing requested data</Shimmer></TaskItem>
          <TaskItem><Shimmer duration={2.2}>Building chart layout</Shimmer></TaskItem>
          <TaskItem><Shimmer duration={2.6}>Rendering chart components</Shimmer></TaskItem>
        </TaskContent>
      </Task>
      <Skeleton className="mt-3 h-[160px] w-full rounded-lg" />
    </div>
  );
}

// ─── Message parts renderer ──────────────────────────────────────────────────

function MessageParts({ message, isLastMessage, isStreaming }: { message: UIMessage; isLastMessage: boolean; isStreaming: boolean }) {
  const reasoningParts = message.parts.filter((p) => p.type === "reasoning");
  const reasoningText = reasoningParts.map((p) => (p as { type: "reasoning"; text: string }).text).join("\n\n");
  const textParts = message.parts.filter((p) => p.type === "text") as Array<{ type: "text"; text: string }>;
  const fullText = textParts.map((p) => p.text).join("\n");
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming = isLastMessage && isStreaming && lastPart?.type === "reasoning";
  const isStreamingThis = isLastMessage && isStreaming;
  const hasNoContent = !fullText.trim() && !reasoningText;
  const pending = isStreamingThis && hasPendingChart(fullText);
  const segments = parseSegments(fullText);
  const hasChart = segments.some((s) => s.type === "chart");

  // If streaming started but no content yet (model is "thinking"), show nothing here
  // The ThinkingTasks component handles this at the conversation level
  if (isStreamingThis && hasNoContent && !isReasoningStreaming) return null;

  return (
    <>
      {reasoningText && (
        <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      )}
      {pending ? (
        <div className="space-y-3 w-full">
          {textBeforeChart(fullText) && <MessageResponse>{textBeforeChart(fullText)}</MessageResponse>}
          <ChartStreamingPlaceholder />
        </div>
      ) : !hasChart ? (
        fullText.trim() ? <MessageResponse>{fullText}</MessageResponse> : null
      ) : (
        <div className="space-y-3 w-full">
          {segments.map((seg, j) =>
            seg.type === "text" ? (
              <MessageResponse key={`${message.id}-${j}`}>{seg.content}</MessageResponse>
            ) : (
              <div key={`${message.id}-${j}`} className="rounded-xl border bg-card p-3 overflow-hidden">
                {seg.chart.title && <p className="text-sm font-medium mb-2 px-1">{seg.chart.title}</p>}
                <AIChart chart={seg.chart} />
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}

// ─── Square-style chat input ─────────────────────────────────────────────────

interface ChatInputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isStreaming: boolean;
  selectedModel: typeof MODELS[number];
  onModelChange: (model: typeof MODELS[number]) => void;
  placeholder?: string;
}

function ChatInputBox({
  value,
  onChange,
  onSend,
  disabled,
  isStreaming,
  selectedModel,
  onModelChange,
  placeholder = "Ask anything...",
}: ChatInputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !disabled && !isStreaming) onSend();
      }
    },
    [value, disabled, isStreaming, onSend]
  );

  return (
    <div className="rounded-2xl border border-border bg-secondary p-1">
      <div className="rounded-xl border border-border bg-card">
        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="min-h-[100px] resize-none border-0 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <ModelSelector>
              <ModelSelectorTrigger asChild>
                <button className="flex items-center gap-1.5 h-7 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <ModelSelectorLogo provider={selectedModel.provider} className="size-3.5" />
                  <span className="hidden sm:inline">{selectedModel.label}</span>
                  <IconChevronDown size={14} />
                </button>
              </ModelSelectorTrigger>
              <ModelSelectorContent>
                <ModelSelectorInput placeholder="Search models..." />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No models found</ModelSelectorEmpty>
                  {["openai", "anthropic", "google"].map((provider) => (
                    <ModelSelectorGroup key={provider} heading={provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "Google"}>
                      {MODELS.filter((m) => m.provider === provider).map((m) => (
                        <ModelSelectorItem
                          key={m.id}
                          value={m.label}
                          onSelect={() => onModelChange(m)}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <ModelSelectorLogo provider={m.provider} className="size-3.5" />
                            <span>{m.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {m.fast && <Badge variant="secondary" className="text-[9px] h-4 px-1">fast</Badge>}
                            {selectedModel.id === m.id && <IconCheck size={12} className="text-primary" />}
                          </div>
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </div>

          <Button
            size="sm"
            onClick={onSend}
            disabled={!value.trim() || disabled || isStreaming}
            className="h-7 px-4 gap-1.5"
          >
            {isStreaming ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : (
              <IconSend size={14} />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIAnalyticsPage() {
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0]!);
  const [inputValue, setInputValue] = useState("");

  const utils = api.useUtils();
  const { data: websitesData } = api.websites.optimized.useQuery();
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData?.items : [];
    return items.map((w) => ({ id: String(w.id ?? ""), name: String(w.name ?? ""), url: String(w.url ?? "") }));
  }, [websitesData]);

  const selectedSite = useMemo(
    () => websites.find((w) => w.id === selectedWebsite),
    [websites, selectedWebsite]
  );
  const selectedWebsiteName = selectedSite?.name ?? "";
  const selectedWebsiteFavicon = useMemo(() => {
    if (!selectedSite?.url) return "";
    try { return `https://www.google.com/s2/favicons?domain=${new URL(selectedSite.url).hostname}&sz=32`; } catch { return ""; }
  }, [selectedSite?.url]);

  const { data: insightsData, isLoading: loadingInsights } = api.ai.insights.useQuery(
    { websiteId: selectedWebsite, timeRange: "30" },
    { enabled: !!selectedWebsite }
  );
  const { data: anomaliesData = [], isLoading: loadingAnomalies } = api.ai.anomalies.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite }
  );
  const { data: predictionsData, isLoading: loadingPredictions } = api.ai.predictions.useQuery(
    { websiteId: selectedWebsite, days: 7 },
    { enabled: !!selectedWebsite }
  );
  const { data: recommendationsData = [], isLoading: loadingRecommendations } = api.ai.recommendations.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite }
  );
  const { data: stripeRevenue } = api.stripe.revenue.useQuery(
    { websiteId: selectedWebsite, days: 30 },
    { enabled: !!selectedWebsite }
  );
  // Data for chart generation
  const { data: overviewData } = api.analytics.overview.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite }
  );
  const { data: statsData } = api.analytics.stats.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite }
  );
  const { data: trafficData } = api.analytics.traffic.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite }
  );
  const { data: speedData } = api.speedInsights.getSummary.useQuery(
    { websiteId: selectedWebsite, period: "30d" },
    { enabled: !!selectedWebsite }
  );
  const { data: scData } = api.searchConsole.getSummary.useQuery(
    { websiteId: selectedWebsite, days: 30 },
    { enabled: !!selectedWebsite }
  );
  const { data: sitemapData } = api.sitemap.getSettings.useQuery(
    { websiteId: selectedWebsite },
    { enabled: !!selectedWebsite }
  );

  const loading = loadingInsights || loadingAnomalies || loadingPredictions || loadingRecommendations;
  const insights: AIInsight | null = insightsData
    ? Array.isArray(insightsData) ? insightsData[0] ?? null : insightsData
    : null;
  const anomalies: Anomaly[] = anomaliesData ?? [];
  const predictions: Prediction[] = Array.isArray(predictionsData) ? predictionsData : [];
  const recommendations: Recommendation[] = recommendationsData ?? [];
  const hasResults = !!(insights || anomalies.length > 0 || predictions.length > 0 || recommendations.length > 0);
  const hasRevenue = !!(stripeRevenue?.totalRevenue && stripeRevenue.totalRevenue > 0);

  // Analytics context ref for fresh access on each request
  const analyticsContextRef = useRef("");
  const overviewRows = overviewData?.data as Array<{ date: string; pageViews: number; uniqueVisitors: number }> | undefined;
  const analyticsContext = useMemo(() => {
    if (!selectedWebsiteName) return "";
    const lines: string[] = [`Website: ${selectedWebsiteName}`];
    if (insights?.summary) lines.push(`AI Summary: ${insights.summary}`);
    if (insights?.keyFindings?.length) lines.push(`Key Findings: ${insights.keyFindings.join(" | ")}`);
    if (anomalies.length) lines.push(`Detected Anomalies: ${anomalies.map((a) => a.message).join(" | ")}`);
    if (recommendations.length) lines.push(`Top Recommendations: ${recommendations.slice(0, 3).map((r) => r.title).join(", ")}`);
    if (predictions.length) lines.push(`7-Day Forecast: ${predictions.map((p) => `${p.date}: ${p.predicted} visitors`).join(", ")}`);
    // Daily data for charts
    if (overviewRows?.length) {
      const last30 = overviewRows.slice(-30);
      lines.push(`\nDaily Data (last ${last30.length} days):`);
      lines.push(`Date | Visitors | PageViews`);
      for (const row of last30) lines.push(`${row.date} | ${row.uniqueVisitors} | ${row.pageViews}`);
    }
    // Top pages
    if (statsData?.topPages?.length) {
      lines.push(`\nTop Pages:`);
      for (const p of statsData.topPages.slice(0, 10)) lines.push(`${p.page} — ${p.views} views`);
    }
    // Device breakdown
    if (statsData?.deviceBreakdown?.length) {
      lines.push(`\nDevice Breakdown:`);
      const total = statsData.deviceBreakdown.reduce((s: number, d: { count: number }) => s + d.count, 0);
      for (const d of statsData.deviceBreakdown) lines.push(`${d.device} — ${d.count} (${total > 0 ? Math.round((d.count / total) * 100) : 0}%)`);
    }
    // Top countries
    if (statsData?.topCountries?.length) {
      lines.push(`\nTop Countries:`);
      for (const c of statsData.topCountries.slice(0, 10)) lines.push(`${c.country} — ${c.visitors} visitors`);
    }
    // Traffic sources
    if (trafficData?.sources?.length) {
      lines.push(`\nTraffic Sources:`);
      for (const s of trafficData.sources.slice(0, 10)) lines.push(`${s.source} — ${s.visitors} visitors (${s.percentage}%)`);
    }
    // Referrers
    if (trafficData?.referrers?.length) {
      lines.push(`\nTop Referrers:`);
      for (const r of trafficData.referrers.slice(0, 10)) lines.push(`${r.referrer} — ${r.visitors} visitors`);
    }
    // Speed Insights (Core Web Vitals)
    if (speedData?.vitals?.length) {
      lines.push(`\nSpeed Insights (Core Web Vitals, last 30 days):`);
      if (speedData.res != null) lines.push(`Real Experience Score (RES): ${speedData.res}/100`);
      lines.push(`Metric | P75 | Good% | Poor% | Samples`);
      for (const v of speedData.vitals) {
        const unit = v.name === "CLS" ? "" : "ms";
        const val = v.name === "CLS" ? (v.p75 / 1000).toFixed(3) : `${v.p75}${unit}`;
        lines.push(`${v.name} | ${val} | ${v.goodPct}% good | ${v.poorPct}% poor | ${v.count} samples`);
      }
    }
    // Search Console
    if (scData && scData.totalClicks > 0) {
      lines.push(`\nSearch Console (last 30 days):`);
      lines.push(`Total clicks: ${scData.totalClicks.toLocaleString()}, Impressions: ${scData.totalImpressions.toLocaleString()}, Avg CTR: ${scData.avgCtr}%, Avg Position: ${scData.avgPosition}`);
      if (scData.topQueries.length > 0) {
        lines.push(`Top Queries:`);
        for (const q of scData.topQueries.slice(0, 10)) {
          lines.push(`  "${q.query}" — ${q.clicks} clicks, ${q.impressions} impressions, CTR ${q.ctr}%, pos ${q.position}`);
        }
      }
      if (scData.topPages.length > 0) {
        lines.push(`Top Pages by Search Clicks:`);
        for (const p of scData.topPages.slice(0, 5)) {
          lines.push(`  ${p.page} — ${p.clicks} clicks, ${p.impressions} impressions`);
        }
      }
    }
    // Sitemap status
    if (sitemapData?.sitemapUrl) {
      lines.push(`\nSitemap Status:`);
      lines.push(`URL: ${sitemapData.sitemapUrl}`);
      lines.push(`Auto-Index: ${sitemapData.autoIndexEnabled ? "enabled" : "disabled"}`);
      lines.push(`IndexNow: ${sitemapData.indexNowEnabled ? "enabled" : "disabled"}`);
      if (sitemapData.stats) {
        const s = sitemapData.stats;
        lines.push(`Pages: ${s.total} total — ${s.pending} pending, ${s.googleSubmitted} submitted to Google, ${s.indexed} indexed, ${s.googleError} errors, ${s.indexNowSubmitted} via IndexNow`);
      }
      if (sitemapData.lastGoogleSubmitAt) {
        lines.push(`Last Google submit: ${new Date(sitemapData.lastGoogleSubmitAt).toISOString()}`);
      }
    }
    return lines.join("\n");
  }, [selectedWebsiteName, insights, anomalies, recommendations, predictions, overviewRows, statsData, trafficData, speedData, scData, sitemapData]);

  useEffect(() => { analyticsContextRef.current = analyticsContext; }, [analyticsContext]);

  const modelIdRef = useRef(selectedModel.id);
  useEffect(() => { modelIdRef.current = selectedModel.id; }, [selectedModel]);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai-chat",
      prepareSendMessagesRequest: ({ messages: msgs, body }) => ({
        body: {
          ...(body ?? {}),
          messages: msgs,
          analyticsContext: analyticsContextRef.current,
          model: modelIdRef.current,
        },
      }),
    }),
  });

  const initializedWebsite = useRef<string>("");
  useEffect(() => {
    if (insights?.summary && selectedWebsite && initializedWebsite.current !== selectedWebsite) {
      initializedWebsite.current = selectedWebsite;
      const cleanSummary = sanitizeInitialSummary(insights.summary);
      setMessages([{
        id: "initial-summary",
        role: "assistant",
        parts: [{ type: "text", text: cleanSummary }],
      } as UIMessage]);
    }
  }, [insights?.summary, selectedWebsite, setMessages]);

  const handleWebsiteChange = (id: string) => {
    setSelectedWebsite(id);
    initializedWebsite.current = "";
    setMessages([]);
  };

  const handleRefresh = () => {
    utils.ai.insights.invalidate();
    utils.ai.anomalies.invalidate();
    utils.ai.predictions.invalidate();
    utils.ai.recommendations.invalidate();
    initializedWebsite.current = "";
    setMessages([]);
  };

  const isStreaming = status === "submitted" || status === "streaming";

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    sendMessage({ text: inputValue });
    setInputValue("");
  }, [inputValue, sendMessage]);

  const handleQuickPrompt = useCallback((prompt: string) => {
    sendMessage({ text: prompt });
  }, [sendMessage]);

  const hasMessages = messages.length > 0;
  const showInlineQuickPrompts = hasResults && !isStreaming && messages.length <= 1;

  // ─── Welcome state (no website selected) ────────────────────────────────────

  if (!selectedWebsite) {
    return (
      <AppLayout>
        <div className="flex h-full flex-col items-center justify-center px-4" style={{ height: "calc(100vh - 5rem)" }}>
          <div className="w-full max-w-[640px] space-y-8 -mt-12">
            <div className="flex justify-center">
              <div className="rounded-2xl bg-muted/50 border p-5">
                <IconSparkles size={32} className="text-primary" />
              </div>
            </div>

            <div className="space-y-3 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">AI Analytics</h1>
              <p className="text-muted-foreground">
                Select a website to start chatting with your data
              </p>
            </div>

            <div className="flex justify-center">
              <Select value={selectedWebsite} onValueChange={handleWebsiteChange}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Select website" /></SelectTrigger>
                <SelectContent>
                  {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ─── Welcome state (website selected, no conversation) ──────────────────────

  if (!hasMessages && !loading) {
    return (
      <AppLayout>
        <div className="flex h-full flex-col items-center justify-center px-4" style={{ height: "calc(100vh - 5rem)" }}>
          <div className="w-full max-w-[640px] space-y-8 -mt-12">
            <div className="flex justify-center">
              <div className="rounded-2xl bg-muted/50 border p-5">
                <IconSparkles size={32} className="text-primary" />
              </div>
            </div>

            <div className="space-y-3 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                {hasResults ? `Ask about ${selectedWebsiteName}` : "AI Analytics"}
              </h1>
              <p className="text-muted-foreground">
                {hasResults
                  ? "Your data is loaded. Ask anything or request a chart."
                  : "Loading your analytics data..."
                }
              </p>
            </div>

            <ChatInputBox
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={!hasResults}
              isStreaming={isStreaming}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              placeholder={hasResults ? "Ask about your analytics..." : "Loading data..."}
            />

            {/* Quick prompts — 3 per row */}
            {hasResults && (
              <div className="grid grid-cols-3 gap-2">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleQuickPrompt(p)}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Select value={selectedWebsite} onValueChange={handleWebsiteChange}>
                <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleRefresh} disabled={loading}>
                <IconRefresh size={13} className={loading ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ─── Conversation view ──────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 pb-3">
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            {selectedWebsiteFavicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedWebsiteFavicon}
                alt=""
                width={16}
                height={16}
                className="rounded-sm shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <IconSparkles size={13} className="text-primary" />
            )}
            {selectedWebsiteName}
          </p>
          <Select value={selectedWebsite} onValueChange={handleWebsiteChange}>
            <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Messages area */}
        <Conversation className="flex-1 min-h-0">
          <ConversationContent className="max-w-[720px] mx-auto">
            {/* Task loading state */}
            {loading && !hasResults && (
              <LoadingTasks hasRevenue={hasRevenue} hasSearchConsole={false} hasSpeedInsights={false} hasSitemap={!!sitemapData?.sitemapUrl} />
            )}

            {/* Messages */}
            {messages.map((message, index) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  <MessageParts
                    message={message}
                    isLastMessage={index === messages.length - 1}
                    isStreaming={isStreaming}
                  />
                </MessageContent>
              </Message>
            ))}

            {/* Thinking indicator — shows while model is working */}
            {isStreaming && (() => {
              const lastMsg = messages.at(-1);
              const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
              const lastAssistantText = lastMsg?.role === "assistant"
                ? lastMsg.parts.filter((p) => p.type === "text").map((p) => (p as { type: "text"; text: string }).text).join("").trim()
                : "";
              // Show thinking tasks when submitted (no response yet) or very early in streaming
              if (status === "submitted" || (lastAssistantText.length < 10 && lastMsg?.role === "assistant")) {
                const query = lastUserMsg?.parts.filter((p) => p.type === "text").map((p) => (p as { type: "text"; text: string }).text).join("") ?? "";
                return <ThinkingTasks query={query} />;
              }
              return null;
            })()}

            {showInlineQuickPrompts && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleQuickPrompt(p)}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Bottom input */}
        <div className="shrink-0 pt-3 pb-2">
          <div className="max-w-[720px] mx-auto">
            <ChatInputBox
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSend}
              disabled={!hasResults}
              isStreaming={isStreaming}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              placeholder="Ask about your analytics or request a chart..."
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
