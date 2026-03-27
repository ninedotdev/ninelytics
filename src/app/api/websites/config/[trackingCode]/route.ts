import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { websites } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingCode: string }> }
) {
  const { trackingCode } = await params;

  try {
    const websiteRows = await db
      .select({
        excludedPaths: websites.excludedPaths,
        cookieConsent: websites.cookieConsent,
        speedInsightsEnabled: websites.speedInsightsEnabled,
      })
      .from(websites)
      .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, 'ACTIVE')))
      .limit(1);

    if (websiteRows.length === 0) {
      return NextResponse.json(
        { error: 'Website not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        excludedPaths: (websiteRows[0].excludedPaths as string[] | null) || [],
        cookieConsent: websiteRows[0].cookieConsent ?? null,
        speedInsights: websiteRows[0].speedInsightsEnabled ?? false,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching website config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(null, { status: 200, headers: corsHeaders });
}
