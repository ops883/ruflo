import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabaseService } from '$lib/server/supabase';
import { generateInsightsPdf } from '$lib/server/reports/insights-pdf';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface EmailRecipient {
  user_email: string;
  user_name: string | null;
  role: string;
}

function formatDateForSubject(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getYesterdayEST(): string {
  const now = new Date();
  // Convert to EST (UTC-5)
  const estOffset = -5 * 60;
  const estNow = new Date(now.getTime() + (estOffset - now.getTimezoneOffset()) * 60000);
  estNow.setDate(estNow.getDate() - 1);
  return estNow.toISOString().split('T')[0];
}

/**
 * Daily insights email cron endpoint.
 * Schedule: 10:30 UTC (5:30 AM EST) via vercel.json crons.
 *
 * For each active location:
 *   1. Generates a PDF insights report for yesterday
 *   2. Queries location_users for email recipients
 *   3. Sends email via Resend API with PDF attachment
 */
export const GET: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const sb = getSupabaseService();
  const yesterday = getYesterdayEST();
  const results: Array<{
    location: string;
    status: string;
    recipients?: number;
    error?: string;
  }> = [];

  // Get all active locations
  const { data: locations, error: locErr } = await sb
    .from('locations')
    .select('id, name')
    .eq('is_active', true);

  if (locErr || !locations) {
    return json({ error: 'Failed to fetch locations', details: locErr?.message }, { status: 500 });
  }

  for (const loc of locations) {
    try {
      // Get recipients for this location
      const { data: recipients, error: recErr } = await sb
        .from('location_users')
        .select('user_email, user_name, role')
        .eq('location_id', loc.id)
        .eq('receives_daily_email', true);

      if (recErr) {
        results.push({ location: loc.name, status: 'error', error: `Recipients query failed: ${recErr.message}` });
        continue;
      }

      if (!recipients || recipients.length === 0) {
        results.push({ location: loc.name, status: 'skipped', error: 'No email recipients configured' });
        continue;
      }

      // Check if there's actual data for yesterday
      const { data: actuals } = await sb
        .from('daily_actuals')
        .select('revenue')
        .eq('location_id', loc.id)
        .eq('business_date', yesterday)
        .maybeSingle();

      if (!actuals || !actuals.revenue) {
        results.push({ location: loc.name, status: 'skipped', error: `No revenue data for ${yesterday}` });
        continue;
      }

      // Generate PDF
      const { buffer, locationName } = await generateInsightsPdf(loc.id, yesterday);

      // Build email
      const toAddresses = recipients.map((r: EmailRecipient) => r.user_email);
      const dateFormatted = formatDateForSubject(yesterday);
      const subject = `Daily KPI Insights \u2014 ${locationName} \u2014 ${dateFormatted}`;

      const htmlBody = buildEmailHtml(locationName, yesterday, dateFormatted, actuals.revenue);

      // Send via Resend
      const emailPayload = {
        from: process.env.RESEND_FROM_EMAIL || 'Method Co KPI <onboarding@resend.dev>',
        to: toAddresses,
        subject,
        html: htmlBody,
        attachments: [
          {
            filename: `KPI-Insights-${locationName.replace(/\s+/g, '-')}-${yesterday}.pdf`,
            content: buffer.toString('base64'),
            content_type: 'application/pdf',
          },
        ],
      };

      const emailRes = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        results.push({
          location: loc.name,
          status: 'error',
          recipients: toAddresses.length,
          error: `Resend API error ${emailRes.status}: ${errBody}`,
        });
        continue;
      }

      results.push({
        location: loc.name,
        status: 'sent',
        recipients: toAddresses.length,
      });
    } catch (err: any) {
      results.push({ location: loc.name, status: 'error', error: err.message });
    }
  }

  return json({
    date: yesterday,
    totalLocations: locations.length,
    results,
  });
};

function buildEmailHtml(
  locationName: string,
  date: string,
  dateFormatted: string,
  revenue: number,
): string {
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:white;">
    <!-- Header -->
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:white;margin:0;font-size:20px;font-weight:600;">Method Co</h1>
      <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Daily KPI Insights Report</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="color:#1e3a5f;margin:0 0 8px;font-size:18px;">${locationName}</h2>
      <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">${dateFormatted}</p>

      <!-- Quick Stats -->
      <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:24px;">
        <p style="color:#6b7280;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">Net Revenue</p>
        <p style="color:#1e3a5f;font-size:28px;font-weight:700;margin:0;">${fmt(revenue)}</p>
      </div>

      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Your daily insights report for ${locationName} is attached as a PDF. The report includes revenue performance vs budget and forecast, covers and average check, sales mix breakdown, PMIX top movers, labor variance analysis, and savings opportunities.
      </p>

      <p style="color:#6b7280;font-size:13px;margin:0;">
        Open the attached PDF for the full report.
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        Method Co KPI Dashboard &mdash; Automated daily insights
      </p>
    </div>
  </div>
</body>
</html>`;
}
