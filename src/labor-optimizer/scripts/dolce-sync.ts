/**
 * Dolce TeamWork Schedule Sync Script
 *
 * Scrapes the Role Analytics report from Dolce Clock for Lowland,
 * maps roles to dashboard positions, distributes weekly totals
 * to daily using DOW weights, and upserts into scheduled_labor.
 *
 * Env vars required:
 *   DOLCE_USERNAME, DOLCE_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Usage:
 *   npx ts-node scripts/dolce-sync.ts
 *   npx ts-node scripts/dolce-sync.ts --week 2026-03-23
 */

import { chromium, type Page } from 'playwright';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOLCE_LOGIN_URL = 'https://www.dolceclock.com/public/login.php?company_id=3243';
const LOWLAND_LOCATION_ID = 'f36fdb18-a97b-48af-8456-7374dea4b0f9';
const REPORT_TYPE_VALUE = '32|0|0|0|0|1'; // Role Analytics
const LOCATION_FILTER_VALUE = '6140';       // Lowland & The Quinte

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getWeekBounds(referenceDate?: string): { monday: string; sunday: string; weekDates: string[] } {
  const target = referenceDate ? new Date(referenceDate + 'T12:00:00') : new Date();
  const dow = target.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(target);
  monday.setDate(monday.getDate() + mondayOffset);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }

  return {
    monday: weekDates[0],
    sunday: weekDates[6],
    weekDates,
  };
}

function formatDateMMDDYYYY(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRole {
  roleName: string;
  scheduledDollars: number;
  scheduledHours: number;
  actualDollars: number;
  actualHours: number;
  section: string; // FOH, BOH, MGT, Contract
}

interface DolceMapping {
  dolce_role_name: string;
  dashboard_position: string;
}

interface DowWeight {
  position: string;
  day_of_week: number;
  weight: number;
}

// ---------------------------------------------------------------------------
// Playwright: Login + Navigate + Scrape
// ---------------------------------------------------------------------------

async function loginToDolce(page: Page): Promise<void> {
  const username = process.env.DOLCE_USERNAME;
  const password = process.env.DOLCE_PASSWORD;
  if (!username || !password) {
    throw new Error('Missing DOLCE_USERNAME or DOLCE_PASSWORD');
  }

  console.log('[Dolce] Navigating to login page...');
  await page.goto(DOLCE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('[Dolce] Current URL:', page.url());
  console.log('[Dolce] Page title:', await page.title());

  // Fill credentials using placeholder text matching
  console.log('[Dolce] Entering credentials...');
  await page.waitForSelector('input[placeholder*="Username"]', { timeout: 15000 });
  await page.fill('input[placeholder*="Username"]', username);
  await page.fill('input[placeholder*="Password"]', password);

  // Click sign in
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(3000);
  console.log('[Dolce] Logged in successfully');
}

async function navigateToReport(page: Page, monday: string, sunday: string): Promise<void> {
  console.log('[Dolce] Navigating to Reports page...');

  // Navigate to reports -- try common Dolce report paths
  const reportPaths = [
    'https://www.dolceclock.com/public/reports.php',
    'https://www.dolceclock.com/public/index.php?page=reports',
  ];

  let navigated = false;
  for (const url of reportPaths) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      navigated = true;
      break;
    } catch {
      continue;
    }
  }

  if (!navigated) {
    // Try clicking a Reports link in the nav
    const reportsLink = page.locator('a:has-text("Reports"), a:has-text("reports")').first();
    if (await reportsLink.isVisible()) {
      await reportsLink.click();
      await page.waitForTimeout(2000);
    }
  }

  // Select report type: Role Analytics
  console.log('[Dolce] Selecting Role Analytics report...');
  const reportSelect = page.locator('select[name="report_type"], select[name="report"], #report_type, #reportType').first();
  await reportSelect.selectOption(REPORT_TYPE_VALUE);
  await page.waitForTimeout(1000);

  // Select location: Lowland & The Quinte
  console.log('[Dolce] Selecting Lowland location...');
  const locationSelect = page.locator('select[name="location"], select[name="location_id"], #location, #locationId').first();
  await locationSelect.selectOption(LOCATION_FILTER_VALUE);
  await page.waitForTimeout(500);

  // Set date range
  const fromDate = formatDateMMDDYYYY(monday);
  const toDate = formatDateMMDDYYYY(sunday);
  console.log(`[Dolce] Setting date range: ${fromDate} - ${toDate}`);

  const fromInput = page.locator('input[name="from_date"], input[name="start_date"], #from_date, #startDate').first();
  const toInput = page.locator('input[name="to_date"], input[name="end_date"], #to_date, #endDate').first();

  await fromInput.fill('');
  await fromInput.fill(fromDate);
  await toInput.fill('');
  await toInput.fill(toDate);

  // Click Show Report
  console.log('[Dolce] Clicking Show Report...');
  const showButton = page.locator('input[value="Show Report"], button:has-text("Show Report"), input[type="submit"][value*="Show"], #showReport').first();
  await showButton.click();

  // Wait for the report to render
  console.log('[Dolce] Waiting for report to render...');
  await page.waitForTimeout(5000);

  // Wait for "Lowland" heading to appear in rendered content
  try {
    await page.waitForSelector('text=Lowland', { timeout: 20000 });
    console.log('[Dolce] Report loaded successfully');
  } catch {
    console.warn('[Dolce] Warning: "Lowland" text not found in report, proceeding anyway');
  }
}

async function parseReportHTML(page: Page): Promise<ParsedRole[]> {
  console.log('[Dolce] Parsing report HTML...');

  const roles = await page.evaluate(() => {
    const results: Array<{
      roleName: string;
      scheduledDollars: number;
      scheduledHours: number;
      actualDollars: number;
      actualHours: number;
      section: string;
    }> = [];

    // Helper to parse dollar amounts like "$2,530.44"
    function parseDollar(text: string): number {
      if (!text) return 0;
      const cleaned = text.replace(/[$,\s]/g, '');
      const val = parseFloat(cleaned);
      return isNaN(val) ? 0 : val;
    }

    // Helper to parse hours like "1,188.00"
    function parseHours(text: string): number {
      if (!text) return 0;
      const cleaned = text.replace(/[,\s]/g, '');
      const val = parseFloat(cleaned);
      return isNaN(val) ? 0 : val;
    }

    // Get all text content to identify sections
    const bodyText = document.body.innerText;

    // Identify sections: Lowland FOH, Lowland BOH, Lowland MGT, Contract Labor
    const sectionMap: Record<string, string> = {};
    const sectionPatterns = [
      { pattern: /Lowland FOH/i, section: 'FOH' },
      { pattern: /Lowland BOH/i, section: 'BOH' },
      { pattern: /Lowland MGT/i, section: 'MGT' },
      { pattern: /Contract Labor/i, section: 'Contract' },
    ];

    // Find all tables in the page
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      // Determine which section this table belongs to
      // Look at preceding text/headers
      let section = 'Unknown';
      let prevEl: Element | null = table;

      // Walk backwards to find section header
      for (let attempts = 0; attempts < 10; attempts++) {
        prevEl = prevEl?.previousElementSibling || prevEl?.parentElement || null;
        if (!prevEl) break;
        const text = prevEl.textContent || '';
        for (const sp of sectionPatterns) {
          if (sp.pattern.test(text)) {
            section = sp.section;
            break;
          }
        }
        if (section !== 'Unknown') break;
      }

      // Also check the table's parent chain
      if (section === 'Unknown') {
        let parent: Element | null = table.parentElement;
        while (parent) {
          const text = parent.textContent || '';
          for (const sp of sectionPatterns) {
            if (sp.pattern.test(text)) {
              section = sp.section;
              break;
            }
          }
          if (section !== 'Unknown') break;
          parent = parent.parentElement;
        }
      }

      // Parse table rows
      const rows = table.querySelectorAll('tr');
      let currentRole: string | null = null;

      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 2) continue;

        const firstCell = cells[0]?.textContent?.trim() || '';
        const isHeader = firstCell.toLowerCase().includes('role') ||
                         firstCell.toLowerCase().includes('sched') ||
                         !firstCell;

        if (isHeader) continue;

        // Check if this is a "Hours" sub-row
        if (firstCell.toLowerCase() === 'hours') {
          // This row has hours data for the current role
          if (currentRole) {
            const existing = results.find(r => r.roleName === currentRole && r.section === section);
            if (existing) {
              // cells: "Hours" | scheduledHours | blank | actualHours
              existing.scheduledHours = parseHours(cells[1]?.textContent || '0');
              if (cells.length >= 4) {
                existing.actualHours = parseHours(cells[3]?.textContent || '0');
              }
            }
          }
          continue;
        }

        // This is a role row: Role | Sched $ | Lbr% | Act $ | Lbr%
        currentRole = firstCell;
        const scheduledDollars = parseDollar(cells[1]?.textContent || '0');
        const actualDollars = cells.length >= 4 ? parseDollar(cells[3]?.textContent || '0') : 0;

        results.push({
          roleName: currentRole,
          scheduledDollars,
          scheduledHours: 0, // filled in by Hours sub-row
          actualDollars,
          actualHours: 0,
          section,
        });
      }
    }

    return results;
  });

  console.log(`[Dolce] Parsed ${roles.length} roles from report`);
  for (const r of roles) {
    console.log(`  [${r.section}] ${r.roleName}: sched=$${r.scheduledDollars.toFixed(2)}, hours=${r.scheduledHours.toFixed(1)}`);
  }

  return roles;
}

// ---------------------------------------------------------------------------
// Supabase: Fetch mappings + DOW weights, upsert scheduled_labor
// ---------------------------------------------------------------------------

async function fetchDolceMappings(sb: SupabaseClient): Promise<DolceMapping[]> {
  const { data, error } = await sb
    .from('dolce_job_mapping')
    .select('dolce_role_name, dashboard_position')
    .eq('location_id', LOWLAND_LOCATION_ID);

  if (error) {
    console.error('[Dolce] Error fetching mappings:', error.message);
    return [];
  }

  return data || [];
}

async function fetchDowWeights(sb: SupabaseClient): Promise<DowWeight[]> {
  const { data, error } = await sb
    .from('dow_weights')
    .select('position, day_of_week, weight')
    .eq('location_id', LOWLAND_LOCATION_ID);

  if (error) {
    console.error('[Dolce] Error fetching DOW weights:', error.message);
    return [];
  }

  return data || [];
}

function distributeWeeklyToDaily(
  weeklyDollars: number,
  weeklyHours: number,
  position: string,
  weekDates: string[],
  dowWeights: DowWeight[],
): Array<{ date: string; dollars: number; hours: number }> {
  // Get weights for this position (day_of_week: 0=Sun, 1=Mon ... 6=Sat)
  const posWeights = dowWeights.filter(w => w.position === position);

  // weekDates[0] = Monday. Map index to JS day-of-week
  const indexToDow = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 .. Sun=0

  const rawWeights: number[] = weekDates.map((_, i) => {
    const dow = indexToDow[i];
    const found = posWeights.find(w => w.day_of_week === dow);
    return found?.weight ?? (1 / 7); // equal split if no weights
  });

  const totalWeight = rawWeights.reduce((s, w) => s + w, 0);
  const normalizedWeights = totalWeight > 0
    ? rawWeights.map(w => w / totalWeight)
    : rawWeights.map(() => 1 / 7);

  return weekDates.map((date, i) => ({
    date,
    dollars: Math.round(weeklyDollars * normalizedWeights[i] * 100) / 100,
    hours: Math.round(weeklyHours * normalizedWeights[i] * 100) / 100,
  }));
}

async function upsertScheduledLabor(
  sb: SupabaseClient,
  records: Array<{ date: string; position: string; dollars: number; hours: number }>,
): Promise<number> {
  let upserted = 0;
  for (const rec of records) {
    if (rec.dollars === 0 && rec.hours === 0) continue;

    const { error } = await sb
      .from('scheduled_labor')
      .upsert(
        {
          location_id: LOWLAND_LOCATION_ID,
          business_date: rec.date,
          position: rec.position,
          scheduled_dollars: rec.dollars,
          scheduled_hours: rec.hours,
          source: 'dolce',
        },
        { onConflict: 'location_id,business_date,position' },
      );

    if (error) {
      console.error(`[Dolce] Upsert error for ${rec.position} on ${rec.date}:`, error.message);
    } else {
      upserted++;
    }
  }
  return upserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Dolce TeamWork Schedule Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Parse --week argument
  const weekArg = process.argv.find(a => a.startsWith('--week'));
  const weekDate = weekArg ? process.argv[process.argv.indexOf(weekArg) + 1] : undefined;
  const { monday, sunday, weekDates } = getWeekBounds(weekDate);
  console.log(`Week: ${monday} to ${sunday}`);

  const sb = getSupabase();

  // Fetch mappings and DOW weights in parallel
  const [mappings, dowWeights] = await Promise.all([
    fetchDolceMappings(sb),
    fetchDowWeights(sb),
  ]);

  console.log(`[Dolce] Loaded ${mappings.length} role mappings, ${dowWeights.length} DOW weights`);

  if (mappings.length === 0) {
    console.error('[Dolce] No role mappings found! Run seed SQL first.');
    process.exit(1);
  }

  // Build mapping lookup
  const mappingLookup = new Map<string, string>();
  for (const m of mappings) {
    mappingLookup.set(m.dolce_role_name.toLowerCase(), m.dashboard_position);
  }

  // Launch browser and scrape
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  try {
    await loginToDolce(page);
    await navigateToReport(page, monday, sunday);
    const roles = await parseReportHTML(page);

    if (roles.length === 0) {
      console.warn('[Dolce] No roles parsed from report. Taking screenshot for debug...');
      await page.screenshot({ path: '/tmp/dolce-debug.png', fullPage: true });
      console.log('[Dolce] Screenshot saved to /tmp/dolce-debug.png');
      process.exit(1);
    }

    // Map roles to dashboard positions and distribute to daily
    const allRecords: Array<{ date: string; position: string; dollars: number; hours: number }> = [];

    // Aggregate by dashboard position (multiple Dolce roles may map to same position)
    const positionAgg = new Map<string, { dollars: number; hours: number }>();

    for (const role of roles) {
      const dashPos = mappingLookup.get(role.roleName.toLowerCase());
      if (!dashPos) {
        console.warn(`  [UNMAPPED] "${role.roleName}" -- skipping`);
        continue;
      }
      if (dashPos === 'EXCLUDE') {
        console.log(`  [EXCLUDED] "${role.roleName}"`);
        continue;
      }

      const existing = positionAgg.get(dashPos) || { dollars: 0, hours: 0 };
      existing.dollars += role.scheduledDollars;
      existing.hours += role.scheduledHours;
      positionAgg.set(dashPos, existing);
    }

    console.log('\n[Dolce] Position aggregates (weekly):');
    for (const [pos, agg] of positionAgg) {
      console.log(`  ${pos}: $${agg.dollars.toFixed(2)}, ${agg.hours.toFixed(1)} hrs`);

      const dailyRecords = distributeWeeklyToDaily(
        agg.dollars,
        agg.hours,
        pos,
        weekDates,
        dowWeights,
      );

      allRecords.push(...dailyRecords.map(d => ({
        date: d.date,
        position: pos,
        dollars: d.dollars,
        hours: d.hours,
      })));
    }

    // Upsert to scheduled_labor
    console.log(`\n[Dolce] Upserting ${allRecords.length} daily records to scheduled_labor...`);
    const upserted = await upsertScheduledLabor(sb, allRecords);
    console.log(`[Dolce] Successfully upserted ${upserted} records`);

    console.log('\n=== Dolce Sync Complete ===');
  } catch (err) {
    console.error('[Dolce] Fatal error:', err);
    try {
      await page.screenshot({ path: '/tmp/dolce-error.png', fullPage: true });
      console.log('[Dolce] Error screenshot saved to /tmp/dolce-error.png');
    } catch {
      // ignore screenshot errors
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
