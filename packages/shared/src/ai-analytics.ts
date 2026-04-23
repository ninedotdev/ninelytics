import type { Anomaly, Prediction, Recommendation } from './types/ai';

interface DailyMetrics {
  date: Date;
  visitors: number;
  pageViews: number;
  bounceRate: number;
  avgSessionDuration: number;
}

interface AnalyticsData {
  current: {
    visitors: number;
    pageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  historical: DailyMetrics[];
  topPages: Array<{ page: string; views: number; bounceRate?: number }>;
  deviceData: Array<{ name: string; count: number; bounceRate?: number }>;
  totalVisitors: number;
}

/**
 * Detect anomalies in analytics data using statistical methods
 */
export function detectAnomalies(data: AnalyticsData): Anomaly[] {
  const anomalies: Anomaly[] = [];
  
  if (data.historical.length < 7) {
    // Not enough data for meaningful anomaly detection
    return anomalies;
  }
  
  // Calculate historical averages and standard deviations
  const recentData = data.historical.slice(-30); // Last 30 days
  const weekData = data.historical.slice(-7); // Last 7 days
  
  // Traffic anomaly detection
  const avgVisitors = calculateAverage(recentData.map(d => d.visitors));
  const stdVisitors = calculateStdDev(recentData.map(d => d.visitors), avgVisitors);
  
  const yesterdayVisitors = data.historical[data.historical.length - 1]?.visitors || 0;
  const visitorChange = ((yesterdayVisitors - avgVisitors) / avgVisitors) * 100;
  
  if (Math.abs(visitorChange) > 30 && Math.abs(yesterdayVisitors - avgVisitors) > stdVisitors * 2) {
    anomalies.push({
      id: `traffic-${Date.now()}`,
      type: visitorChange > 0 ? 'traffic_spike' : 'traffic_drop',
      severity: Math.abs(visitorChange) > 50 ? 'critical' : 'warning',
      metric: 'Visitors',
      currentValue: yesterdayVisitors,
      expectedValue: Math.round(avgVisitors),
      changePercent: visitorChange,
      message: `Traffic ${visitorChange > 0 ? 'spiked' : 'dropped'} by ${Math.abs(visitorChange).toFixed(1)}% (${yesterdayVisitors} vs expected ${Math.round(avgVisitors)})`,
      detectedAt: new Date(),
    });
  }
  
  // Bounce rate anomaly detection
  const avgBounce = calculateAverage(recentData.map(d => d.bounceRate));
  const currentBounce = data.current.bounceRate;
  const bounceChange = ((currentBounce - avgBounce) / avgBounce) * 100;
  
  if (Math.abs(bounceChange) > 20) {
    anomalies.push({
      id: `bounce-${Date.now()}`,
      type: 'bounce_spike',
      severity: bounceChange > 30 ? 'critical' : 'warning',
      metric: 'Bounce Rate',
      currentValue: currentBounce,
      expectedValue: avgBounce,
      changePercent: bounceChange,
      message: `Bounce rate ${bounceChange > 0 ? 'increased' : 'decreased'} to ${currentBounce.toFixed(1)}% (expected ${avgBounce.toFixed(1)}%)`,
      detectedAt: new Date(),
    });
  }
  
  // Session duration anomaly detection
  const avgSession = calculateAverage(recentData.map(d => d.avgSessionDuration));
  const currentSession = data.current.avgSessionDuration;
  const sessionChange = ((currentSession - avgSession) / avgSession) * 100;
  
  if (Math.abs(sessionChange) > 25) {
    anomalies.push({
      id: `session-${Date.now()}`,
      type: 'session_drop',
      severity: sessionChange < -30 ? 'warning' : 'info',
      metric: 'Avg Session Duration',
      currentValue: currentSession,
      expectedValue: avgSession,
      changePercent: sessionChange,
      message: `Session duration ${sessionChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(sessionChange).toFixed(1)}% (${Math.round(currentSession)}s vs ${Math.round(avgSession)}s)`,
      detectedAt: new Date(),
    });
  }
  
  // Week-over-week comparison
  const lastWeekAvg = calculateAverage(weekData.map(d => d.visitors));
  const previousWeekData = data.historical.slice(-14, -7);
  
  if (previousWeekData.length === 7) {
    const prevWeekAvg = calculateAverage(previousWeekData.map(d => d.visitors));
    const weekChange = ((lastWeekAvg - prevWeekAvg) / prevWeekAvg) * 100;
    
    if (Math.abs(weekChange) > 40) {
      anomalies.push({
        id: `week-trend-${Date.now()}`,
        type: weekChange > 0 ? 'traffic_spike' : 'traffic_drop',
        severity: 'info',
        metric: 'Weekly Trend',
        currentValue: Math.round(lastWeekAvg),
        expectedValue: Math.round(prevWeekAvg),
        changePercent: weekChange,
        message: `This week's traffic is ${weekChange > 0 ? 'up' : 'down'} ${Math.abs(weekChange).toFixed(1)}% compared to last week`,
        detectedAt: new Date(),
      });
    }
  }
  
  return anomalies;
}

/**
 * Generate traffic predictions using linear regression
 */
export function generatePredictions(historical: DailyMetrics[], days: number = 7): Prediction[] {
  if (historical.length < 14) {
    return []; // Not enough data for predictions
  }
  
  // Use last 30 days for prediction
  const data = historical.slice(-30);
  
  // Simple linear regression
  const { slope, intercept } = linearRegression(
    data.map((_, i) => i),
    data.map(d => d.visitors)
  );
  
  // Calculate standard error for confidence intervals
  const predictions = data.map((_, i) => slope * i + intercept);
  const errors = data.map((d, i) => d.visitors - predictions[i]);
  const standardError = Math.sqrt(
    errors.reduce((sum, e) => sum + e * e, 0) / errors.length
  );
  
  const confidenceMultiplier = 1.96; // 95% confidence interval
  
  // Generate predictions
  const result: Prediction[] = [];
  const lastIndex = data.length - 1;
  const lastDate = data[lastIndex].date;
  
  for (let i = 1; i <= days; i++) {
    const predictedValue = slope * (lastIndex + i) + intercept;
    const margin = confidenceMultiplier * standardError * Math.sqrt(1 + 1 / data.length);
    
    const date = new Date(lastDate);
    date.setDate(date.getDate() + i);
    
    result.push({
      date: date.toISOString().split('T')[0],
      predicted: Math.max(0, Math.round(predictedValue)),
      confidence: {
        lower: Math.max(0, Math.round(predictedValue - margin)),
        upper: Math.round(predictedValue + margin),
      },
    });
  }
  
  return result;
}

/**
 * Generate smart recommendations based on analytics data
 */
export function generateRecommendations(data: AnalyticsData): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  const {
    current: { bounceRate, avgSessionDuration },
    topPages,
    deviceData,
    totalVisitors,
  } = data;
  
  // High bounce rate recommendation
  if (bounceRate > 70) {
    recommendations.push({
      id: 'bounce-rate-high',
      priority: 'high',
      category: 'ux',
      title: 'High Bounce Rate Detected',
      description: `Your bounce rate is ${bounceRate.toFixed(1)}%, which is above the healthy threshold of 70%. This means most visitors leave after viewing only one page.`,
      expectedImpact: 'Reducing bounce rate by 10-15% could increase conversions by 20-30%',
      actionItems: [
        'Improve page load speed (aim for < 3 seconds)',
        'Make your call-to-action more prominent',
        'Ensure content matches visitor expectations',
        'Improve mobile responsiveness',
      ],
    });
  }
  
  // Short session duration recommendation
  if (avgSessionDuration < 30) {
    recommendations.push({
      id: 'session-short',
      priority: 'high',
      category: 'content',
      title: 'Short Session Duration',
      description: `Average session duration is only ${Math.round(avgSessionDuration)} seconds. Visitors aren't engaging deeply with your content.`,
      expectedImpact: 'Increasing session time can improve SEO rankings and conversion rates',
      actionItems: [
        'Add internal links to related content',
        'Include engaging multimedia (videos, images)',
        'Improve content quality and readability',
        'Add clear next steps or related articles',
      ],
    });
  }
  
  // Mobile-specific recommendations
  const mobileData = deviceData.find(d => d.name.toLowerCase() === 'mobile');
  const desktopData = deviceData.find(d => d.name.toLowerCase() === 'desktop');
  
  if (mobileData && desktopData && totalVisitors > 100) {
    const mobilePercentage = (mobileData.count / totalVisitors) * 100;
    
    if (mobilePercentage > 60) {
      const mobileBounce = mobileData.bounceRate || bounceRate;
      const desktopBounce = desktopData.bounceRate || bounceRate;
      
      if (mobileBounce > desktopBounce + 15) {
        recommendations.push({
          id: 'mobile-ux',
          priority: 'high',
          category: 'technical',
          title: 'Mobile UX Issues',
          description: `${mobilePercentage.toFixed(0)}% of your traffic is mobile, but mobile bounce rate (${mobileBounce.toFixed(1)}%) is significantly higher than desktop (${desktopBounce.toFixed(1)}%).`,
          expectedImpact: 'Optimizing mobile experience could recover 20-30% of lost mobile visitors',
          actionItems: [
            'Test site on multiple mobile devices',
            'Optimize images for mobile bandwidth',
            'Ensure buttons and links are touch-friendly',
            'Simplify mobile navigation',
          ],
        });
      }
    }
  }
  
  // Top page with high bounce rate
  const problematicPages = topPages.filter(p => p.bounceRate && p.bounceRate > 80);
  if (problematicPages.length > 0) {
    const topProblematic = problematicPages[0];
    recommendations.push({
      id: 'page-bounce',
      priority: 'medium',
      category: 'content',
      title: 'High-Traffic Page Underperforming',
      description: `Your page "${topProblematic.page}" receives ${topProblematic.views} views but has a ${topProblematic.bounceRate?.toFixed(1)}% bounce rate.`,
      expectedImpact: 'Optimizing this page could significantly impact overall performance',
      actionItems: [
        'Review page content and value proposition',
        'Add clear calls-to-action',
        'Check for technical issues or slow loading',
        'A/B test different layouts or headlines',
      ],
    });
  }
  
  // Performance recommendation if avg session is good but bounce is high
  if (avgSessionDuration > 60 && bounceRate > 60) {
    recommendations.push({
      id: 'conversion-opportunity',
      priority: 'medium',
      category: 'conversion',
      title: 'Conversion Optimization Opportunity',
      description: 'Visitors who stay are engaged (good session time), but many leave quickly. This suggests a targeting or first-impression issue.',
      expectedImpact: 'Better targeting could improve conversion rate by 15-25%',
      actionItems: [
        'Review traffic sources and improve targeting',
        'Optimize landing pages for better first impression',
        'Use exit-intent popups to capture leaving visitors',
        'Ensure page headlines match ad copy',
      ],
    });
  }
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations.slice(0, 5); // Return top 5
}

// Helper functions

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function calculateStdDev(numbers: number[], mean: number): number {
  if (numbers.length === 0) return 0;
  const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
  const variance = squaredDiffs.reduce((sum, sq) => sum + sq, 0) / numbers.length;
  return Math.sqrt(variance);
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = y.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
  const sumXX = x.reduce((sum, val) => sum + val * val, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return { slope, intercept };
}

