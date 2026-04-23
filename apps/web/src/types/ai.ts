export interface Anomaly {
  id: string;
  type: 'traffic_drop' | 'traffic_spike' | 'conversion_drop' | 'bounce_spike' | 'session_drop';
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  currentValue: number;
  expectedValue: number;
  changePercent: number;
  message: string;
  detectedAt: Date;
}

export interface Prediction {
  date: string;
  predicted: number;
  confidence: {
    lower: number;
    upper: number;
  };
}

export interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'performance' | 'content' | 'ux' | 'technical' | 'conversion';
  title: string;
  description: string;
  expectedImpact: string;
  actionItems: string[];
}

export interface AIInsight {
  summary: string;
  keyFindings: string[];
  generatedAt: Date;
}

export interface AnalyticsSnapshot {
  websiteId: string;
  websiteName: string;
  websiteDescription?: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalVisitors: number;
    totalPageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
    topPages: Array<{ page: string; views: number }>;
    topSources: Array<{ source: string; visitors: number }>;
    deviceBreakdown: Array<{ device: string; percentage: number }>;
  };
  trends: {
    visitorsChange: number;
    pageViewsChange: number;
    bounceRateChange: number;
  };
  searchConsole?: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
    topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
    topPages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  stripe?: {
    totalRevenue: number;       // cents
    totalRefunds: number;       // cents
    totalCharges: number;
    totalNewCustomers: number;
    currency: string;
    avgRevenuePerDay: number;   // cents
    revenueChange: number;      // % change vs previous period
  };
  speedInsights?: {
    res: number;                // Real Experience Score 0-100
    vitals: Array<{
      name: string;             // LCP | FCP | INP | CLS | TTFB
      p75: number;              // 75th percentile value
      goodPct: number;          // % of sessions rated "good"
      count: number;
    }>;
  };
}

