import OpenAI from 'openai';
import type { AnalyticsSnapshot, AIInsight, Anomaly } from './types/ai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano'; // Override with OPENAI_MODEL env var (e.g. gpt-5.4, gpt-4.1-mini)

// Rate limiting (simple in-memory cache), capped to prevent unbounded growth.
const requestCache = new Map<string, { data: AIInsight; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const REQUEST_CACHE_MAX_ENTRIES = 500;

export async function generateAIInsights(
  snapshot: AnalyticsSnapshot,
  anomalies: Anomaly[]
): Promise<AIInsight> {
  // Check cache
  const cacheKey = `${snapshot.websiteId}-${snapshot.period.start.toISOString()}`;
  const cached = requestCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY) {
    return generateFallbackInsights(snapshot, anomalies);
  }

  try {
    const prompt = buildPrompt(snapshot, anomalies);
    
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert web analytics consultant. Provide clear, actionable insights in a professional but conversational tone. Focus on what matters most to the business. IMPORTANT: Never use markdown formatting — no asterisks, no bold, no headers, no bullet markers. Use plain text only. Use dashes (-) for lists.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || '';
    
    // Parse response into structured format
    const insight = parseAIResponse(response);
    
    // Cache the result (with size cap via LRU eviction)
    if (requestCache.has(cacheKey)) requestCache.delete(cacheKey);
    requestCache.set(cacheKey, { data: insight, timestamp: Date.now() });
    if (requestCache.size > REQUEST_CACHE_MAX_ENTRIES) {
      const oldest = requestCache.keys().next().value;
      if (oldest !== undefined) requestCache.delete(oldest);
    }

    return insight;
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Fallback to rule-based insights
    return generateFallbackInsights(snapshot, anomalies);
  }
}

function buildPrompt(snapshot: AnalyticsSnapshot, anomalies: Anomaly[]): string {
  const { metrics, trends, period, websiteDescription } = snapshot;
  
  const periodStr = `${period.start.toLocaleDateString()} to ${period.end.toLocaleDateString()}`;
  
  let prompt = `Analyze this website analytics data and provide insights:

Website: ${snapshot.websiteName}
${websiteDescription ? `Website Description: ${websiteDescription}\n(Important: Use this description to understand the website's purpose and context. For example, if it's a booking site, short session times may indicate efficient user flows, not problems.)` : ''}
Period: ${periodStr}

Key Metrics:
- Total Visitors: ${metrics.totalVisitors.toLocaleString()} (${trends.visitorsChange > 0 ? '+' : ''}${trends.visitorsChange.toFixed(1)}% change)
- Page Views: ${metrics.totalPageViews.toLocaleString()} (${trends.pageViewsChange > 0 ? '+' : ''}${trends.pageViewsChange.toFixed(1)}% change)
- Bounce Rate: ${metrics.bounceRate.toFixed(1)}% (${trends.bounceRateChange > 0 ? '+' : ''}${trends.bounceRateChange.toFixed(1)}% change)
- Avg Session: ${Math.floor(metrics.avgSessionDuration / 60)}m ${metrics.avgSessionDuration % 60}s

Top Pages:
${metrics.topPages.slice(0, 3).map(p => `- ${p.page}: ${p.views} views`).join('\n')}

Traffic Sources:
${metrics.topSources.slice(0, 3).map(s => `- ${s.source}: ${s.visitors} visitors`).join('\n')}

Device Breakdown:
${metrics.deviceBreakdown.map(d => `- ${d.device}: ${d.percentage}%`).join('\n')}
`;

  // Search Console data (when available)
  if (snapshot.searchConsole) {
    const sc = snapshot.searchConsole;
    prompt += `\nSearch Console Data (Google Search Performance):
- Total Clicks: ${sc.totalClicks.toLocaleString()}
- Total Impressions: ${sc.totalImpressions.toLocaleString()}
- Average CTR: ${(sc.avgCtr * 100).toFixed(1)}%
- Average Position: ${sc.avgPosition.toFixed(1)}

Top Search Queries:
${sc.topQueries.slice(0, 5).map(q => `- "${q.query}": ${q.clicks} clicks, ${q.impressions} impressions, ${(q.ctr * 100).toFixed(1)}% CTR, pos ${q.position.toFixed(1)}`).join('\n')}

Top Pages in Search:
${sc.topPages.slice(0, 5).map(p => `- ${p.page}: ${p.clicks} clicks, ${p.impressions} impressions, ${(p.ctr * 100).toFixed(1)}% CTR, pos ${p.position.toFixed(1)}`).join('\n')}
`;
  }

  // Stripe revenue data (when available)
  if (snapshot.stripe) {
    const s = snapshot.stripe;
    const formatMoney = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    prompt += `\nRevenue Data (Stripe):
- Total Revenue: ${formatMoney(s.totalRevenue)} ${s.currency.toUpperCase()} (${s.revenueChange > 0 ? '+' : ''}${s.revenueChange.toFixed(1)}% vs previous period)
- Total Refunds: ${formatMoney(s.totalRefunds)}
- Successful Charges: ${s.totalCharges.toLocaleString()}
- New Customers: ${s.totalNewCustomers.toLocaleString()}
- Avg Revenue/Day: ${formatMoney(s.avgRevenuePerDay)}
`;
  }

  // Speed Insights (Core Web Vitals — when available)
  if (snapshot.speedInsights) {
    const si = snapshot.speedInsights
    const fmtVital = (name: string, p75: number) => {
      if (name === "CLS") return (p75 / 1000).toFixed(3)
      return p75 >= 1000 ? `${(p75 / 1000).toFixed(1)}s` : `${p75}ms`
    }
    prompt += `\nSpeed Insights (Real User Data — p75, last ${Math.round((snapshot.period.end.getTime() - snapshot.period.start.getTime()) / 86400000)} days):
Real Experience Score: ${si.res}/100

| Metric | p75 | Good % |
|--------|-----|--------|
${si.vitals.map(v => `| ${v.name} | ${fmtVital(v.name, v.p75)} | ${v.goodPct}% |`).join('\n')}
`;
  }

  if (anomalies.length > 0) {
    prompt += `\n\nDetected Anomalies:\n`;
    anomalies.forEach(a => {
      prompt += `- ${a.severity.toUpperCase()}: ${a.message}\n`;
    });
  }

  prompt += `\n\nProvide:
1. A concise summary (2-3 sentences) of the overall performance
2. 3-4 key findings or insights
3. One actionable recommendation`;

  if (snapshot.searchConsole) {
    prompt += `\n4. SEO insights: cross-reference search data with site analytics. Look for:
   - High impression queries with low CTR (title/description optimization)
   - Top search pages with high bounce rates (content mismatch)
   - Position trends for key queries
   - Organic vs referral traffic correlation`;
  }

  if (snapshot.stripe) {
    const idx = [snapshot.searchConsole, snapshot.speedInsights].filter(Boolean).length + 4
    prompt += `\n${idx}. Revenue insights: correlate traffic with revenue. Look for:
   - Revenue per visitor trends
   - Traffic sources that drive the most revenue
   - Conversion efficiency (charges vs visitors)
   - Customer acquisition cost trends
   - Refund patterns and their correlation with traffic sources`;
  }

  if (snapshot.speedInsights) {
    const idx = [snapshot.searchConsole, snapshot.stripe].filter(Boolean).length + 4
    prompt += `\n${idx}. Speed insights: analyze Core Web Vitals impact. Look for:
   - Poor LCP correlated with high bounce rate (slow loading drives users away)
   - Poor INP on high-traffic pages (unresponsive interactions hurt conversions)
   - Metrics below "good" threshold that most need improvement
   - Whether mobile visitors have worse vitals than desktop`;
  }

  prompt += `\n\nFormat your response as:
SUMMARY: [your summary here]
KEY FINDINGS:
- [finding 1]
- [finding 2]
- [finding 3]`;

  return prompt;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')      // bold **text**
    .replace(/\*/g, '')        // italic *text*
    .replace(/^#{1,6}\s+/gm, '') // headers
    .replace(/`([^`]+)`/g, '$1') // inline code
    .trim()
}

function parseAIResponse(response: string): AIInsight {
  const clean = stripMarkdown(response);
  const lines = clean.split('\n').filter(l => l.trim());
  
  let summary = '';
  const keyFindings: string[] = [];
  let inFindings = false;
  
  for (const line of lines) {
    if (line.startsWith('SUMMARY:')) {
      summary = line.replace('SUMMARY:', '').trim();
    } else if (line.includes('KEY FINDINGS')) {
      inFindings = true;
    } else if (inFindings && line.trim().startsWith('-')) {
      keyFindings.push(line.trim().replace(/^-\s*/, ''));
    } else if (inFindings && summary) {
      summary += ' ' + line.trim();
    }
  }
  
  // If parsing failed, use the whole response as summary
  if (!summary) {
    summary = response.substring(0, 300);
  }
  
  // If no findings extracted, create generic ones
  if (keyFindings.length === 0) {
    keyFindings.push('Analysis of traffic patterns and user behavior');
    keyFindings.push('Performance metrics and engagement trends');
    keyFindings.push('Opportunities for optimization identified');
  }
  
  return {
    summary,
    keyFindings: keyFindings.slice(0, 5),
    generatedAt: new Date(),
  };
}

function generateFallbackInsights(
  snapshot: AnalyticsSnapshot,
  anomalies: Anomaly[]
): AIInsight {
  const { metrics, trends } = snapshot;
  
  const trendDirection = trends.visitorsChange > 0 ? 'increased' : 'decreased';
  const trendMagnitude = Math.abs(trends.visitorsChange);
  
  let summary = `Traffic has ${trendDirection} by ${trendMagnitude.toFixed(1)}% during this period. `;
  
  if (metrics.bounceRate > 70) {
    summary += 'Bounce rate is elevated, indicating potential UX issues. ';
  } else if (metrics.bounceRate < 40) {
    summary += 'Bounce rate is healthy, showing good user engagement. ';
  }
  
  const topSource = metrics.topSources[0];
  if (topSource) {
    summary += `Most traffic comes from ${topSource.source} sources.`;
  }
  
  const keyFindings: string[] = [];
  
  if (trends.visitorsChange > 10) {
    keyFindings.push(`Strong growth in visitor traffic (+${trends.visitorsChange.toFixed(1)}%)`);
  } else if (trends.visitorsChange < -10) {
    keyFindings.push(`Significant drop in visitor traffic (${trends.visitorsChange.toFixed(1)}%)`);
  }
  
  if (metrics.deviceBreakdown.length > 0) {
    const mobileDevice = metrics.deviceBreakdown.find(d => d.device.toLowerCase() === 'mobile');
    if (mobileDevice && mobileDevice.percentage > 60) {
      keyFindings.push(`Mobile-dominant audience (${mobileDevice.percentage}% of traffic)`);
    }
  }
  
  if (metrics.avgSessionDuration < 30) {
    keyFindings.push('Short average session duration suggests room for content improvement');
  }
  
  if (anomalies.length > 0) {
    const critical = anomalies.filter(a => a.severity === 'critical');
    if (critical.length > 0) {
      keyFindings.push(`${critical.length} critical anomaly detected requiring immediate attention`);
    }
  }
  
  if (keyFindings.length === 0) {
    keyFindings.push('Stable performance with consistent traffic patterns');
    keyFindings.push('User engagement metrics are within normal ranges');
  }
  
  return {
    summary,
    keyFindings,
    generatedAt: new Date(),
  };
}

