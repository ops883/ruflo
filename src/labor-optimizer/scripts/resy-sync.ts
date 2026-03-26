/**
 * Resy Reservation Sync Script
 *
 * Scrapes the Resy OS portal for Lowland (Charleston) to pull:
 *   1. Upcoming Covers (forward-looking booked covers from Home page)
 *   2. Daily Covers Report (historical covers from Analytics > Covers)
 *
 * Upserts all data into the daily_reservations table in Supabase.
 *
 * Env vars required:
 *   RESY_USERNAME, RESY_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Usage:
 *   npx tsx scripts/resy-sync.ts
 *   npx tsx scripts/resy-sync.ts --month 2026-03
 */

import { chromium, type Page, type BrowserContext } from 'playwright';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RESY_LOGIN_URL = 'https://os.resy.com';
const RESY_HOME_URL = 'https://os.resy.com/portal/chs/lowland/Home';
const RESY_COVERS_URL = 'https://os.resy.com/portal/chs/lowland/analytics/Covers';
const LOWLAND_LOCATION_ID = 'f36fdb18-a97b-48af-8456-7374dea4b0f9';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ---------------------------------------------------------------------------
// Supabase REST helpers (no SDK dependency for standalone script)
// ---------------------------------------------------------------------------

async function supabaseUpsert(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': `resolution=merge-duplicates`,
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${body}`);
  }
}

async function supabaseInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpcomingCover {
  date: string;       // YYYY-MM-DD
  covers: number;
}

interface DailyCoverRow {
  date: string;       // YYYY-MM-DD
  dayOfWeek: string;
  service: string;
  totalCovers: number;
  coversVsPrevWeek: number | null;
  reservedCovers: number;
  walkinCovers: number;
  waitlistCovers: number;
  noShowCovers: number;
  noShowParties: number;
  noShowResRate: number | null;
}

interface HomeSummary {
  coversBooked: number;
  firstTimeGuests: number;
  returningGuests: number;
  vips: number;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getCurrentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse "Thu Mar 26" or "Fri Mar 27" relative to the current year into YYYY-MM-DD */
function parseUpcomingDate(text: string): string | null {
  // Remove the day-of-week prefix if present, e.g., "Thu Mar 26" -> "Mar 26"
  const cleaned = text.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/i, '').trim();

  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const match = cleaned.match(/^(\w{3})\s+(\d{1,2})$/);
  if (!match) return null;

  const monthNum = months[match[1]];
  if (monthNum === undefined) return null;

  const day = parseInt(match[2], 10);
  const year = new Date().getFullYear();

  const d = new Date(year, monthNum, day);
  return d.toISOString().split('T')[0];
}

/** Convert month arg "2026-03" to display format "Mar 2026" for Resy dropdown */
function monthArgToDisplay(monthArg: string): string {
  const [year, month] = monthArg.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

// ---------------------------------------------------------------------------
// Playwright: Login
// ---------------------------------------------------------------------------

async function loginToResy(page: Page): Promise<void> {
  const username = process.env.RESY_USERNAME;
  const password = process.env.RESY_PASSWORD;
  if (!username || !password) {
    throw new Error('Missing RESY_USERNAME or RESY_PASSWORD');
  }

  console.log('[Resy] Navigating to login page...');
  await page.goto(RESY_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if we're already logged in (redirected to venues or Home)
  const currentUrl = page.url();
  if (currentUrl.includes('/portal/')) {
    console.log('[Resy] Already logged in');
    return;
  }

  // Look for email/username input
  console.log('[Resy] Entering credentials...');

  // Resy OS uses email-based login
  const emailInput = page.locator(
    'input[type="email"], input[name="email"], input[name="username"], ' +
    'input[placeholder*="email" i], input[placeholder*="Email" i]'
  ).first();

  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(username);

  const passwordInput = page.locator(
    'input[type="password"], input[name="password"]'
  ).first();
  await passwordInput.fill(password);

  // Click sign in button
  const signInButton = page.locator(
    'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In"), ' +
    'button:has-text("Continue"), input[type="submit"]'
  ).first();
  await signInButton.click();

  // Wait for navigation after login
  console.log('[Resy] Waiting for post-login navigation...');
  await page.waitForTimeout(5000);

  // Verify we're past the login page
  const postLoginUrl = page.url();
  if (!postLoginUrl.includes('/portal/') && !postLoginUrl.includes('/venues')) {
    // Might need to handle MFA or additional auth steps
    console.warn(`[Resy] Unexpected URL after login: ${postLoginUrl}`);
    await page.screenshot({ path: '/tmp/resy-login-debug.png', fullPage: true });
    console.log('[Resy] Debug screenshot saved to /tmp/resy-login-debug.png');
  }

  console.log('[Resy] Login successful');
}

// ---------------------------------------------------------------------------
// Playwright: Navigate to Lowland venue
// ---------------------------------------------------------------------------

async function navigateToLowland(page: Page): Promise<void> {
  const currentUrl = page.url();

  // If we're already on a Lowland page, skip
  if (currentUrl.includes('/chs/lowland/')) {
    console.log('[Resy] Already on Lowland venue');
    return;
  }

  // If on venues page, click Lowland
  if (currentUrl.includes('/venues') || currentUrl.includes('/portal')) {
    console.log('[Resy] Looking for Lowland venue...');

    // Try clicking the Lowland link/card
    const lowlandLink = page.locator(
      'a:has-text("Lowland"), div:has-text("Lowland") >> nth=0, ' +
      '[data-venue-name="Lowland"], [href*="lowland"]'
    ).first();

    try {
      await lowlandLink.waitFor({ state: 'visible', timeout: 10000 });
      await lowlandLink.click();
      await page.waitForTimeout(3000);
    } catch {
      console.log('[Resy] Lowland link not found on venue page, navigating directly...');
      await page.goto(RESY_HOME_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    }
  }

  // If there's a city/location sub-selection (Charleston)
  const charlestonLink = page.locator(
    'a:has-text("Charleston"), div:has-text("Charleston"), [data-city="Charleston"]'
  ).first();
  try {
    if (await charlestonLink.isVisible({ timeout: 3000 })) {
      await charlestonLink.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    // Charleston selection not needed or not visible
  }

  // Ensure we're on the Home page
  if (!page.url().includes('/chs/lowland/')) {
    console.log('[Resy] Navigating directly to Lowland Home...');
    await page.goto(RESY_HOME_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  console.log(`[Resy] On venue page: ${page.url()}`);
}

// ---------------------------------------------------------------------------
// Scrape: Home page — Upcoming Covers + Today Summary
// ---------------------------------------------------------------------------

async function scrapeUpcomingCovers(page: Page): Promise<UpcomingCover[]> {
  console.log('[Resy] Scraping Upcoming Covers from Home page...');

  // Make sure we're on the Home page
  if (!page.url().includes('/Home')) {
    await page.goto(RESY_HOME_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  // Scroll down to ensure "Upcoming Covers" section is visible
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(1000);

  const covers = await page.evaluate(() => {
    const results: Array<{ dateText: string; covers: number }> = [];

    // Strategy 1: Look for "Upcoming Covers" section header, then parse sibling items
    const allText = document.body.innerText;
    const upcomingIdx = allText.indexOf('Upcoming Covers');

    if (upcomingIdx >= 0) {
      // Extract text after "Upcoming Covers" up to the next major section
      const afterText = allText.substring(upcomingIdx + 'Upcoming Covers'.length, upcomingIdx + 2000);
      const lines = afterText.split('\n').map(l => l.trim()).filter(Boolean);

      // Pattern: "Thu Mar 26" followed by a number like "136"
      // or "Thu Mar 26: 136" on one line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Try combined format: "Thu Mar 26: 136" or "Thu Mar 26 136"
        const combinedMatch = line.match(/^((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3}\s+\d{1,2})[:\s]+(\d+)/i);
        if (combinedMatch) {
          results.push({ dateText: combinedMatch[1], covers: parseInt(combinedMatch[2], 10) });
          continue;
        }

        // Try date on one line, number on next
        const dateMatch = line.match(/^((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3}\s+\d{1,2})$/i);
        if (dateMatch && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const numMatch = nextLine.match(/^(\d+)$/);
          if (numMatch) {
            results.push({ dateText: dateMatch[1], covers: parseInt(numMatch[1], 10) });
            i++; // skip the number line
          }
        }
      }
    }

    // Strategy 2: DOM-based — look for elements containing upcoming cover data
    if (results.length === 0) {
      // Try finding a list/table with date + number pairs
      const containers = document.querySelectorAll(
        '[class*="upcoming"], [class*="cover"], [class*="forecast"], [data-testid*="upcoming"]'
      );

      for (const container of containers) {
        const items = container.querySelectorAll('li, tr, [class*="item"], [class*="row"]');
        for (const item of items) {
          const text = item.textContent?.trim() || '';
          const match = text.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3}\s+\d{1,2})[:\s]*(\d+)/i);
          if (match) {
            results.push({ dateText: match[1], covers: parseInt(match[2], 10) });
          }
        }
      }
    }

    return results;
  });

  const parsed: UpcomingCover[] = [];
  for (const c of covers) {
    const date = parseUpcomingDateInBrowser(c.dateText);
    if (date) {
      parsed.push({ date, covers: c.covers });
    }
  }

  console.log(`[Resy] Found ${parsed.length} upcoming cover entries`);
  for (const c of parsed) {
    console.log(`  ${c.date}: ${c.covers} covers`);
  }

  return parsed;
}

/** Browser-safe version of parseUpcomingDate (duplicated for evaluate context) */
function parseUpcomingDateInBrowser(text: string): string | null {
  return parseUpcomingDate(text);
}

async function scrapeHomeSummary(page: Page): Promise<HomeSummary | null> {
  console.log('[Resy] Scraping today summary from Home page...');

  if (!page.url().includes('/Home')) {
    await page.goto(RESY_HOME_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  const summary = await page.evaluate(() => {
    const text = document.body.innerText;

    function extractNumber(label: string): number {
      // Look for patterns like "Covers booked\n136" or "Covers booked: 136"
      const pattern = new RegExp(label + '[:\\s]*(\\d+)', 'i');
      const match = text.match(pattern);
      return match ? parseInt(match[1], 10) : 0;
    }

    const coversBooked = extractNumber('Covers booked') || extractNumber('Covers');
    const firstTimeGuests = extractNumber('First.time guests') || extractNumber('First time');
    const returningGuests = extractNumber('Returning guests') || extractNumber('Returning');
    const vips = extractNumber('VIPs') || extractNumber('VIP');

    if (coversBooked === 0 && firstTimeGuests === 0 && returningGuests === 0 && vips === 0) {
      return null;
    }

    return { coversBooked, firstTimeGuests, returningGuests, vips };
  });

  if (summary) {
    console.log(`[Resy] Today summary: ${summary.coversBooked} covers booked, ` +
      `${summary.firstTimeGuests} first-time, ${summary.returningGuests} returning, ${summary.vips} VIPs`);
  } else {
    console.log('[Resy] Could not parse today summary cards');
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Scrape: Analytics > Covers page — historical daily data
// ---------------------------------------------------------------------------

async function scrapeDailyCovers(page: Page, targetMonth?: string): Promise<DailyCoverRow[]> {
  console.log('[Resy] Navigating to Covers report...');
  await page.goto(RESY_COVERS_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Select month if specified
  if (targetMonth) {
    const displayMonth = monthArgToDisplay(targetMonth);
    console.log(`[Resy] Selecting month: ${displayMonth}`);

    // Try dropdown/select for month
    const monthSelector = page.locator(
      'select:near(:text("Month")), select[class*="month"], ' +
      '[data-testid*="month"], button:has-text("Mar 2026")'
    ).first();

    try {
      if (await monthSelector.isVisible({ timeout: 5000 })) {
        const tagName = await monthSelector.evaluate(el => el.tagName.toLowerCase());
        if (tagName === 'select') {
          await monthSelector.selectOption({ label: displayMonth });
        } else {
          // It's a button/dropdown — click and select
          await monthSelector.click();
          await page.waitForTimeout(500);
          const option = page.locator(`text="${displayMonth}"`).first();
          if (await option.isVisible({ timeout: 3000 })) {
            await option.click();
          }
        }
        await page.waitForTimeout(2000);
      }
    } catch {
      console.warn('[Resy] Could not select month via dropdown, trying other methods...');

      // Try clicking text that matches the month
      try {
        const monthLink = page.locator(`text="${displayMonth}"`).first();
        if (await monthLink.isVisible({ timeout: 3000 })) {
          await monthLink.click();
          await page.waitForTimeout(2000);
        }
      } catch {
        console.warn('[Resy] Month selection failed, proceeding with default month');
      }
    }
  }

  // Wait for table to load
  await page.waitForTimeout(2000);

  console.log('[Resy] Parsing daily covers table...');

  const rows = await page.evaluate((targetMonthStr: string | undefined) => {
    const results: Array<{
      dateText: string;
      dayOfWeek: string;
      service: string;
      totalCovers: number;
      coversVsPrevWeek: number | null;
      reservedCovers: number;
      walkinCovers: number;
      waitlistCovers: number;
      noShowCovers: number;
      noShowParties: number;
      noShowResRate: number | null;
    }> = [];

    function parseNum(text: string): number {
      if (!text) return 0;
      const cleaned = text.replace(/[,\s%$]/g, '');
      const val = parseFloat(cleaned);
      return isNaN(val) ? 0 : val;
    }

    // Find the covers table — look for tables with expected column headers
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (!headerRow) continue;

      const headerCells = headerRow.querySelectorAll('th, td');
      const headers = Array.from(headerCells).map(c => c.textContent?.trim().toLowerCase() || '');

      // Check if this looks like the covers table
      const hasDate = headers.some(h => h.includes('date'));
      const hasCovers = headers.some(h => h.includes('cover') || h.includes('total'));
      if (!hasDate && !hasCovers) continue;

      // Map column indices
      const dateIdx = headers.findIndex(h => h.includes('date'));
      const dayIdx = headers.findIndex(h => h.includes('day'));
      const serviceIdx = headers.findIndex(h => h.includes('service'));
      const totalIdx = headers.findIndex(h => h.includes('total cover'));
      const vsPrevIdx = headers.findIndex(h => h.includes('prev week') || h.includes('vs prev'));
      const reservedIdx = headers.findIndex(h => h.includes('reserved'));
      const walkinIdx = headers.findIndex(h => h.includes('walk'));
      const waitlistIdx = headers.findIndex(h => h.includes('waitlist'));
      const noShowCovIdx = headers.findIndex(h => h.includes('no show cover') || h.includes('no show c'));
      const noShowPartIdx = headers.findIndex(h =>
        (h.includes('no show') && h.includes('part')) || h.includes('no show p'));
      const noShowRateIdx = headers.findIndex(h => h.includes('no show') && h.includes('rate'));

      // Parse data rows
      const dataRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      for (const row of dataRows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;

        const dateText = cells[dateIdx >= 0 ? dateIdx : 0]?.textContent?.trim() || '';
        if (!dateText || dateText.toLowerCase().includes('total')) continue;

        results.push({
          dateText,
          dayOfWeek: dayIdx >= 0 ? (cells[dayIdx]?.textContent?.trim() || '') : '',
          service: serviceIdx >= 0 ? (cells[serviceIdx]?.textContent?.trim() || 'Dinner') : 'Dinner',
          totalCovers: parseNum(cells[totalIdx >= 0 ? totalIdx : 3]?.textContent || '0'),
          coversVsPrevWeek: vsPrevIdx >= 0 ? parseNum(cells[vsPrevIdx]?.textContent || '0') : null,
          reservedCovers: parseNum(cells[reservedIdx >= 0 ? reservedIdx : 5]?.textContent || '0'),
          walkinCovers: parseNum(cells[walkinIdx >= 0 ? walkinIdx : 6]?.textContent || '0'),
          waitlistCovers: parseNum(cells[waitlistIdx >= 0 ? waitlistIdx : 7]?.textContent || '0'),
          noShowCovers: parseNum(cells[noShowCovIdx >= 0 ? noShowCovIdx : 8]?.textContent || '0'),
          noShowParties: parseNum(cells[noShowPartIdx >= 0 ? noShowPartIdx : 8]?.textContent || '0'),
          noShowResRate: noShowRateIdx >= 0 ? parseNum(cells[noShowRateIdx]?.textContent || '0') : null,
        });
      }
    }

    // If table parsing failed, try text-based parsing
    if (results.length === 0) {
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Match lines like "Mar 1\tSat\tDinner\t145\t..." or similar
        const parts = line.split(/\t+/);
        if (parts.length >= 5) {
          const dateText = parts[0];
          // Rough check: does it look like a date?
          if (/\w{3}\s+\d{1,2}/.test(dateText) || /\d{1,2}\/\d{1,2}/.test(dateText)) {
            results.push({
              dateText,
              dayOfWeek: parts[1] || '',
              service: parts[2] || 'Dinner',
              totalCovers: parseNum(parts[3] || '0'),
              coversVsPrevWeek: parts[4] ? parseNum(parts[4]) : null,
              reservedCovers: parseNum(parts[5] || '0'),
              walkinCovers: parseNum(parts[6] || '0'),
              waitlistCovers: parseNum(parts[7] || '0'),
              noShowCovers: parseNum(parts[8] || '0'),
              noShowParties: parseNum(parts[8] || '0'),
              noShowResRate: parts[9] ? parseNum(parts[9]) : null,
            });
          }
        }
      }
    }

    return results;
  }, targetMonth);

  // Convert date texts to YYYY-MM-DD
  const month = targetMonth || getCurrentMonthStr();
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  const parsed: DailyCoverRow[] = [];
  for (const row of rows) {
    const date = parseCoverDate(row.dateText, year, monthNum);
    if (date) {
      parsed.push({
        ...row,
        date,
      });
    }
  }

  console.log(`[Resy] Parsed ${parsed.length} daily cover rows`);
  for (const r of parsed) {
    console.log(`  ${r.date} (${r.dayOfWeek}): total=${r.totalCovers}, reserved=${r.reservedCovers}, ` +
      `walkin=${r.walkinCovers}, noshow=${r.noShowCovers}`);
  }

  return parsed;
}

/** Parse date text from the covers table (e.g., "Mar 1", "3/1", "2026-03-01") */
function parseCoverDate(text: string, year: number, month: number): string | null {
  if (!text) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // "Mar 1" or "Mar 01"
  const monthNames: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const mNameMatch = text.match(/^(\w{3})\s+(\d{1,2})$/);
  if (mNameMatch) {
    const m = monthNames[mNameMatch[1]];
    if (m) {
      const d = parseInt(mNameMatch[2], 10);
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // "3/1" or "03/01"
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10);
    const d = parseInt(slashMatch[2], 10);
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Just a day number? Use the target month
  const dayOnly = text.match(/^(\d{1,2})$/);
  if (dayOnly) {
    const d = parseInt(dayOnly[1], 10);
    if (d >= 1 && d <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Upsert to Supabase
// ---------------------------------------------------------------------------

async function upsertDailyReservations(
  historicalRows: DailyCoverRow[],
  upcomingCovers: UpcomingCover[],
): Promise<number> {
  const now = new Date().toISOString();
  let upserted = 0;

  // Upsert historical data (full detail)
  for (const row of historicalRows) {
    try {
      await supabaseUpsert('daily_reservations', {
        location_id: LOWLAND_LOCATION_ID,
        business_date: row.date,
        total_covers: row.totalCovers,
        booked_covers: row.reservedCovers,
        walkin_covers: row.walkinCovers,
        no_show_count: row.noShowCovers || row.noShowParties,
        synced_at: now,
        source: 'resy_scraper',
      }, 'location_id,business_date');
      upserted++;
    } catch (err: any) {
      console.error(`[Resy] Upsert error for ${row.date}:`, err.message);
    }
  }

  // Upsert upcoming (future) covers — only booked_covers since these are forward-looking
  const historicalDates = new Set(historicalRows.map(r => r.date));
  const today = new Date().toISOString().split('T')[0];

  for (const uc of upcomingCovers) {
    // Skip if we already have historical data for this date (more complete)
    if (historicalDates.has(uc.date)) continue;

    try {
      await supabaseUpsert('daily_reservations', {
        location_id: LOWLAND_LOCATION_ID,
        business_date: uc.date,
        booked_covers: uc.covers,
        synced_at: now,
      }, 'location_id,business_date');
      upserted++;
    } catch (err: any) {
      console.error(`[Resy] Upsert error for upcoming ${uc.date}:`, err.message);
    }

    // Track pickup: insert snapshot (NOT upsert — preserve time series)
    const targetDate = new Date(uc.date + 'T12:00:00');
    const todayDate = new Date(today + 'T12:00:00');
    const daysOut = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
    try {
      await supabaseInsert('reservation_pickup', {
        location_id: LOWLAND_LOCATION_ID,
        business_date: uc.date,
        days_out: daysOut,
        booked_covers: uc.covers,
      });
    } catch (_) { /* ignore — duplicate snapshots in same run are fine */ }
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Resy Reservation Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Validate env vars
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  if (!process.env.RESY_USERNAME || !process.env.RESY_PASSWORD) {
    throw new Error('Missing RESY_USERNAME or RESY_PASSWORD');
  }

  // Parse --month argument
  const monthArgIdx = process.argv.indexOf('--month');
  const targetMonth = monthArgIdx >= 0 ? process.argv[monthArgIdx + 1] : undefined;

  if (targetMonth) {
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      throw new Error(`Invalid --month format: ${targetMonth}. Expected YYYY-MM`);
    }
    console.log(`Target month: ${targetMonth}`);
  } else {
    console.log(`Target month: ${getCurrentMonthStr()} (current)`);
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Set a generous default timeout
  page.setDefaultTimeout(20000);

  try {
    // Step 1: Login
    await loginToResy(page);

    // Step 2: Navigate to Lowland
    await navigateToLowland(page);

    // Step 3: Scrape upcoming covers from Home page
    let upcomingCovers: UpcomingCover[] = [];
    let homeSummary: HomeSummary | null = null;
    try {
      upcomingCovers = await scrapeUpcomingCovers(page);
      homeSummary = await scrapeHomeSummary(page);
    } catch (err: any) {
      console.warn(`[Resy] Warning: Could not scrape Home page: ${err.message}`);
      await page.screenshot({ path: '/tmp/resy-home-debug.png', fullPage: true });
    }

    // Step 4: Scrape daily covers from Analytics > Covers
    let dailyCoverRows: DailyCoverRow[] = [];
    try {
      dailyCoverRows = await scrapeDailyCovers(page, targetMonth);
    } catch (err: any) {
      console.warn(`[Resy] Warning: Could not scrape Covers report: ${err.message}`);
      await page.screenshot({ path: '/tmp/resy-covers-debug.png', fullPage: true });
    }

    if (dailyCoverRows.length === 0 && upcomingCovers.length === 0) {
      console.error('[Resy] No data scraped from either page. Taking debug screenshot...');
      await page.screenshot({ path: '/tmp/resy-empty-debug.png', fullPage: true });
      console.log('[Resy] Screenshot saved to /tmp/resy-empty-debug.png');
      process.exit(1);
    }

    // Step 5: Upsert to Supabase
    console.log(`\n[Resy] Upserting ${dailyCoverRows.length} historical + ${upcomingCovers.length} upcoming rows...`);
    const upserted = await upsertDailyReservations(dailyCoverRows, upcomingCovers);
    console.log(`[Resy] Successfully upserted ${upserted} records to daily_reservations`);

    // Summary
    console.log('\n=== Resy Sync Summary ===');
    console.log(`Historical rows scraped: ${dailyCoverRows.length}`);
    console.log(`Upcoming cover dates:    ${upcomingCovers.length}`);
    console.log(`Total upserted:          ${upserted}`);
    if (homeSummary) {
      console.log(`Today's covers booked:   ${homeSummary.coversBooked}`);
      console.log(`First-time guests:       ${homeSummary.firstTimeGuests}`);
      console.log(`Returning guests:        ${homeSummary.returningGuests}`);
      console.log(`VIPs:                    ${homeSummary.vips}`);
    }
    console.log('=== Resy Sync Complete ===');

  } catch (err) {
    console.error('[Resy] Fatal error:', err);
    try {
      await page.screenshot({ path: '/tmp/resy-error.png', fullPage: true });
      console.log('[Resy] Error screenshot saved to /tmp/resy-error.png');
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
