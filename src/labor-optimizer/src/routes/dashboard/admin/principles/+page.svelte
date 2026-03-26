<script lang="ts">
  import { getClientSupabase } from '$lib/supabase-client';
  import { goto } from '$app/navigation';

  let isAdmin = $state(false);
  let authChecked = $state(false);
  const ADMIN_EMAILS = ['rr@methodco.com'];

  $effect(() => {
    const supabase = getClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email ?? null;
      isAdmin = !!email && ADMIN_EMAILS.includes(email);
      authChecked = true;
      if (!isAdmin && authChecked) goto('/dashboard');
    });
  });

  let expandAll = $state(false);

  function toggleAll() {
    expandAll = !expandAll;
    const details = document.querySelectorAll('.principles-section');
    details.forEach((el) => {
      (el as HTMLDetailsElement).open = expandAll;
    });
  }
</script>

<svelte:head>
  <title>Principles - Method KPI Dashboard</title>
</svelte:head>

{#if !authChecked}
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-sm text-gray-400">Loading...</p>
  </div>
{:else if !isAdmin}
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-sm text-gray-400">Access denied</p>
  </div>
{:else}
  <div class="px-3 py-4 md:px-4 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-2">
        <a href="/dashboard/settings" class="text-sm" style="color: #1e3a5f;">Settings</a>
        <span class="text-gray-300">/</span>
        <span class="text-sm text-gray-500">Principles</span>
      </div>
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 class="text-2xl font-bold" style="color: #1e3a5f;">Dashboard Principles</h1>
          <p class="text-sm text-gray-500 mt-1">Methodology, assumptions, and underlying logic for all KPI dashboard features.</p>
        </div>
        <button onclick={toggleAll} class="leo-btn-secondary text-xs">
          {expandAll ? 'Collapse All' : 'Expand All'}
        </button>
      </div>
    </div>

    <!-- Table of Contents -->
    <div class="leo-card p-5 mb-6">
      <h2 class="leo-section-title mb-3">Contents</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        <a href="#revenue-forecasting" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">1. Revenue Forecasting</a>
        <a href="#labor-thresholds" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">2. Labor Threshold System</a>
        <a href="#dow-weights" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">3. Daily Labor Projection (DOW Weights)</a>
        <a href="#schedule-approval" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">4. Schedule Approval Workflow</a>
        <a href="#toast-integration" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">5. Toast POS Integration</a>
        <a href="#budget-methodology" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">6. Budget Methodology</a>
        <a href="#variance-analysis" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">7. Variance Analysis</a>
        <a href="#ai-insights" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">8. AI Insights Engine</a>
        <a href="#forecast-accuracy" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">9. Forecast Accuracy & Self-Learning</a>
        <a href="#external-data" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">10. External Data Signals</a>
        <a href="#covers-check" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">11. Covers & Average Check</a>
        <a href="#ptd-totals" class="text-sm py-1 hover:underline" style="color: #1e3a5f;">12. Period-to-Date (PTD) Totals</a>
      </div>
    </div>

    <!-- Sections -->
    <div class="space-y-4">

      <!-- 1. Revenue Forecasting -->
      <details id="revenue-forecasting" class="principles-section leo-card" open>
        <summary class="section-header">
          <span class="section-number">1</span>
          Revenue Forecasting
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">4-Signal Weighted Blend</h4>
          <p class="body-text">Revenue forecasts are generated from a blend of four independent signals, each contributing a weighted share to the final projection:</p>
          <table class="signal-table">
            <thead>
              <tr>
                <th class="leo-th text-left" style="border-radius: 6px 0 0 0;">Signal</th>
                <th class="leo-th" style="border-radius: 0 6px 0 0;">Default Weight</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="leo-td text-left font-medium">Trailing 2-week DOW average</td><td class="leo-td">40%</td></tr>
              <tr><td class="leo-td text-left font-medium">Prior Year (growth-adjusted)</td><td class="leo-td">25%</td></tr>
              <tr><td class="leo-td text-left font-medium">Momentum / trend</td><td class="leo-td">20%</td></tr>
              <tr><td class="leo-td text-left font-medium">Budget baseline</td><td class="leo-td">15%</td></tr>
            </tbody>
          </table>

          <h4 class="subsection-title">Adaptive Weights</h4>
          <p class="body-text">Weights are not static. The system evaluates forecast accuracy weekly and adjusts weights toward signals that have been more predictive. A signal that consistently outperforms can grow to 50% weight; a poor performer can shrink to 10%.</p>

          <h4 class="subsection-title">Confidence Scoring</h4>
          <p class="body-text">Each forecast includes a confidence score (0-100) based on data availability, historical accuracy for that day-of-week, and signal agreement. Low-confidence forecasts are flagged for manager review.</p>

          <h4 class="subsection-title">Override Tags</h4>
          <p class="body-text">Managers can tag known events that affect revenue (Private Events, Holiday, Weather, Construction, etc.). These tags are tracked so the system can learn the revenue impact of each event type over time.</p>

          <h4 class="subsection-title">Forecast Locking</h4>
          <p class="body-text">Once a manager accepts a forecast, it locks and becomes the official projection for scheduling and labor targets. Only admin/director roles can unlock a previously accepted forecast.</p>
        </div>
      </details>

      <!-- 2. Labor Threshold System -->
      <details id="labor-thresholds" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">2</span>
          Labor Threshold System
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Revenue Bracket Structure</h4>
          <p class="body-text">Weekly revenue is bucketed into brackets ranging from $60K to $125K in $5K increments. Each bracket determines total weekly labor dollar allocation per position type.</p>

          <h4 class="subsection-title">Position Allocations</h4>
          <p class="body-text">Each bracket defines weekly labor dollars for the following positions:</p>
          <div class="tag-row">
            <span class="tag">Server</span>
            <span class="tag">Bartender</span>
            <span class="tag">Host</span>
            <span class="tag">Support</span>
            <span class="tag">Training</span>
            <span class="tag">Line Cooks</span>
            <span class="tag">Prep Cooks</span>
            <span class="tag">Dishwashers</span>
          </div>

          <h4 class="subsection-title">Bracket Calibration</h4>
          <p class="body-text">Threshold brackets are calibrated using three inputs: the annual budget, historical labor-to-revenue ratios, and the Restaurant Questionnaire (which captures operational characteristics like service style, menu complexity, and layout).</p>

          <h4 class="subsection-title">Change Control</h4>
          <p class="body-text">Any modification to threshold brackets requires admin approval. Changes are logged with timestamp, user, and justification.</p>
        </div>
      </details>

      <!-- 3. Daily Labor Projection (DOW Weights) -->
      <details id="dow-weights" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">3</span>
          Daily Labor Projection (DOW Weights)
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Purpose</h4>
          <p class="body-text">Weekly labor targets (from the threshold system) must be distributed across seven days. Day-of-week weights reflect actual business volume patterns, allocating more labor to high-volume days.</p>

          <h4 class="subsection-title">Default Weights</h4>
          <table class="signal-table">
            <thead>
              <tr>
                <th class="leo-th text-left" style="border-radius: 6px 0 0 0;">Day</th>
                <th class="leo-th">Mon</th>
                <th class="leo-th">Tue</th>
                <th class="leo-th">Wed</th>
                <th class="leo-th">Thu</th>
                <th class="leo-th">Fri</th>
                <th class="leo-th">Sat</th>
                <th class="leo-th" style="border-radius: 0 6px 0 0;">Sun</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="leo-td text-left font-medium">Weight</td>
                <td class="leo-td">10.2%</td>
                <td class="leo-td">10.2%</td>
                <td class="leo-td">11.7%</td>
                <td class="leo-td">15.1%</td>
                <td class="leo-td">20.1%</td>
                <td class="leo-td">20.1%</td>
                <td class="leo-td">12.6%</td>
              </tr>
            </tbody>
          </table>

          <h4 class="subsection-title">Adaptive Learning</h4>
          <p class="body-text">Weights adapt weekly using a blended approach: 70% current weight + 30% actual labor distribution from the prior week. This allows gradual convergence toward real patterns without overreacting to single-week anomalies.</p>

          <h4 class="subsection-title">Reconciliation</h4>
          <p class="body-text">Daily projections always sum to the weekly threshold total. If manual adjustments are made to individual days, the system redistributes the remainder proportionally across untouched days.</p>
        </div>
      </details>

      <!-- 4. Schedule Approval Workflow -->
      <details id="schedule-approval" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">4</span>
          Schedule Approval Workflow
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Weekly Timeline</h4>
          <div class="timeline">
            <div class="timeline-step">
              <span class="timeline-dot"></span>
              <div>
                <p class="font-medium text-sm" style="color: #1e3a5f;">Wednesday (by EOD)</p>
                <p class="body-text mt-0">Manager accepts or modifies AI forecast. Accepted forecast produces projected labor targets per position per day.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="timeline-dot"></span>
              <div>
                <p class="font-medium text-sm" style="color: #1e3a5f;">Wed-Thu</p>
                <p class="body-text mt-0">Team builds schedules in Dolce TeamWork using projected labor targets as guide.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="timeline-dot"></span>
              <div>
                <p class="font-medium text-sm" style="color: #1e3a5f;">Thursday 1:00 PM EST</p>
                <p class="body-text mt-0">Dolce scheduled labor syncs automatically to the KPI dashboard.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="timeline-dot"></span>
              <div>
                <p class="font-medium text-sm" style="color: #1e3a5f;">Thursday (afternoon)</p>
                <p class="body-text mt-0">Manager submits schedule for approval through the KPI dashboard.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="timeline-dot"></span>
              <div>
                <p class="font-medium text-sm" style="color: #1e3a5f;">Thu-Fri</p>
                <p class="body-text mt-0">Admin/Director approves or requests revision. Variance between projected and scheduled labor is tracked.</p>
              </div>
            </div>
          </div>
        </div>
      </details>

      <!-- 5. Toast POS Integration -->
      <details id="toast-integration" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">5</span>
          Toast POS Integration
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Daily Sync</h4>
          <p class="body-text">Data syncs daily at <strong>5:00 AM EST</strong>. Each sync pulls the following for the prior business day:</p>
          <ul class="body-list">
            <li>Net revenue (excluding tax and tips)</li>
            <li>Cover counts</li>
            <li>Labor by job position (hours and dollars)</li>
            <li>Sales mix breakdown</li>
            <li>PMIX (product mix) detail</li>
          </ul>

          <h4 class="subsection-title">Revenue Calculation</h4>
          <p class="body-text">Revenue uses <code class="code-inline">checks[].amount</code> (net), not <code class="code-inline">totalAmount</code> (which includes tax and tips). This ensures consistency with industry-standard net revenue reporting.</p>

          <h4 class="subsection-title">Labor Calculation</h4>
          <p class="body-text">Labor cost is calculated from time entries multiplied by hourly rate for each employee, grouped by their Toast job position.</p>

          <h4 class="subsection-title">Position Mapping</h4>
          <p class="body-text">Toast job positions are mapped to dashboard positions. This mapping is configurable in Settings to accommodate location-specific naming conventions.</p>

          <h4 class="subsection-title">Sales Mix Categories</h4>
          <div class="tag-row">
            <span class="tag">Food</span>
            <span class="tag">Cocktails</span>
            <span class="tag">Liquor</span>
            <span class="tag">Wine</span>
            <span class="tag">Beer</span>
            <span class="tag">Non-Alcoholic</span>
            <span class="tag">Other</span>
          </div>
        </div>
      </details>

      <!-- 6. Budget Methodology -->
      <details id="budget-methodology" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">6</span>
          Budget Methodology
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Source Data</h4>
          <p class="body-text">Annual budget is loaded from the Excel Lead Sheet. The fiscal year spans 364 days (52 weeks) on a Monday-through-Sunday calendar.</p>

          <h4 class="subsection-title">Fiscal Year Structure</h4>
          <table class="signal-table">
            <thead>
              <tr>
                <th class="leo-th text-left" style="border-radius: 6px 0 0 0;">Parameter</th>
                <th class="leo-th text-left" style="border-radius: 0 6px 0 0;">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="leo-td text-left font-medium">Fiscal year start</td><td class="leo-td text-left">Last Monday of December (12/29/2025 for FY2026)</td></tr>
              <tr><td class="leo-td text-left font-medium">Duration</td><td class="leo-td text-left">364 days (52 weeks)</td></tr>
              <tr><td class="leo-td text-left font-medium">Period structure</td><td class="leo-td text-left">13 four-week periods (P1 through P13)</td></tr>
              <tr><td class="leo-td text-left font-medium">Week definition</td><td class="leo-td text-left">Monday through Sunday</td></tr>
            </tbody>
          </table>

          <h4 class="subsection-title">Budget Provides</h4>
          <ul class="body-list">
            <li>Daily revenue targets</li>
            <li>Daily labor dollars by position</li>
          </ul>

          <h4 class="subsection-title">Variance Convention</h4>
          <p class="body-text">Variance = Actual - Budget. For labor costs, a positive variance means actual spending exceeded the budget (unfavorable). For revenue, a positive variance means outperformance (favorable).</p>
        </div>
      </details>

      <!-- 7. Variance Analysis -->
      <details id="variance-analysis" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">7</span>
          Variance Analysis
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Revenue Variance</h4>
          <ul class="body-list">
            <li><strong>Actual vs Budget:</strong> How actual revenue compares to the annual plan</li>
            <li><strong>Actual vs Forecast:</strong> How actual revenue compares to the AI-generated forecast</li>
          </ul>

          <h4 class="subsection-title">Labor Variance</h4>
          <ul class="body-list">
            <li><strong>Actual vs Projected:</strong> Actual labor compared to the threshold-driven target (primary operational metric)</li>
            <li><strong>Actual vs Budget:</strong> Actual labor compared to the annual plan</li>
          </ul>

          <h4 class="subsection-title">Flagging Threshold</h4>
          <p class="body-text">Positions where actual labor exceeds projected by more than 1.5% of revenue are automatically flagged for review. This identifies meaningful overages while filtering out noise.</p>

          <h4 class="subsection-title">Percentage Mode Convention</h4>
          <p class="body-text">When viewing data in percentage mode, variance is calculated as the <em>difference of percentages</em>, not percentage change. For example: if Actual Labor % is 22.5% and Projected Labor % is 20.0%, variance = +2.5 percentage points (not +12.5%).</p>

          <h4 class="subsection-title">Color Convention</h4>
          <div class="flex items-center gap-4 mt-2">
            <span class="inline-flex items-center gap-2 text-sm"><span class="w-3 h-3 rounded-full inline-block" style="background: #dc2626;"></span> Positive labor variance = over budget (unfavorable)</span>
            <span class="inline-flex items-center gap-2 text-sm"><span class="w-3 h-3 rounded-full inline-block" style="background: #16a34a;"></span> Negative labor variance = under budget (favorable)</span>
          </div>
        </div>
      </details>

      <!-- 8. AI Insights Engine -->
      <details id="ai-insights" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">8</span>
          AI Insights Engine
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Daily Narrative</h4>
          <p class="body-text">An automated narrative is generated each day from multiple data sources:</p>
          <ul class="body-list">
            <li>Revenue performance vs budget and forecast</li>
            <li>Cover count and average check trends</li>
            <li>Sales mix shifts and PMIX movers (top gaining/declining items)</li>
            <li>Labor variance by position</li>
            <li>Weather conditions and reservation data</li>
          </ul>

          <h4 class="subsection-title">Comps & Discounts</h4>
          <p class="body-text">Comps and discounts are tracked as a percentage of revenue and included in daily reporting when they exceed normal thresholds.</p>

          <h4 class="subsection-title">Labor Savings Suggestions</h4>
          <p class="body-text">The system analyzes hourly labor efficiency and identifies potential savings opportunities based on periods of low revenue-per-labor-hour.</p>

          <h4 class="subsection-title">Manager Notes</h4>
          <p class="body-text">Each day includes a free-text narrative field where managers can add operational context (e.g., staffing issues, special circumstances, equipment problems).</p>

          <h4 class="subsection-title">PDF Distribution</h4>
          <p class="body-text">A PDF report is compiled and emailed daily at <strong>5:30 AM EST</strong> to the location's distribution group.</p>
        </div>
      </details>

      <!-- 9. Forecast Accuracy & Self-Learning -->
      <details id="forecast-accuracy" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">9</span>
          Forecast Accuracy & Self-Learning
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Self-Grading System</h4>
          <p class="body-text">Forecast accuracy is scored on a 0-100 scale composed of five weighted components:</p>
          <table class="signal-table">
            <thead>
              <tr>
                <th class="leo-th text-left" style="border-radius: 6px 0 0 0;">Component</th>
                <th class="leo-th">Weight</th>
                <th class="leo-th text-left" style="border-radius: 0 6px 0 0;">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="leo-td text-left font-medium">Accuracy</td><td class="leo-td">30%</td><td class="leo-td text-left">How close forecasts are to actual revenue (MAPE inverse)</td></tr>
              <tr><td class="leo-td text-left font-medium">Consistency</td><td class="leo-td">20%</td><td class="leo-td text-left">Stability of forecast quality across days</td></tr>
              <tr><td class="leo-td text-left font-medium">Bias Control</td><td class="leo-td">20%</td><td class="leo-td text-left">Absence of systematic over- or under-forecasting</td></tr>
              <tr><td class="leo-td text-left font-medium">Improvement</td><td class="leo-td">15%</td><td class="leo-td text-left">Trend of accuracy improving over time</td></tr>
              <tr><td class="leo-td text-left font-medium">Coverage</td><td class="leo-td">15%</td><td class="leo-td text-left">Percentage of days with sufficient data for forecasting</td></tr>
            </tbody>
          </table>

          <h4 class="subsection-title">MAPE Tracking</h4>
          <p class="body-text">Mean Absolute Percentage Error is tracked per day-of-week to identify which days are more or less predictable. This informs both weight adjustments and confidence scoring.</p>

          <h4 class="subsection-title">Bias Detection</h4>
          <p class="body-text">If the system detects a systematic bias greater than 3% (consistently over- or under-forecasting), it auto-corrects by applying a bias offset to future forecasts until the bias returns to acceptable levels.</p>

          <h4 class="subsection-title">Override Tag Learning</h4>
          <p class="body-text">When managers tag a forecast with an event type (e.g., "Holiday," "Weather"), the system tracks the actual revenue impact. Over time, it builds a profile of how each event type affects revenue and can pre-adjust forecasts when similar events are anticipated.</p>

          <h4 class="subsection-title">Adaptive Signal Weights</h4>
          <p class="body-text">Forecast signal weights shift based on performance. A signal that has been more accurate recently can rise to a 50% weight; a consistently poor signal drops to a 10% floor. This ensures the forecast model self-improves continuously.</p>

          <h4 class="subsection-title">Target</h4>
          <p class="body-text">The goal is continuous improvement toward 99% accuracy through iterative learning, bias correction, and event impact modeling.</p>
        </div>
      </details>

      <!-- 10. External Data Signals -->
      <details id="external-data" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">10</span>
          External Data Signals
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Weather (OpenWeatherMap)</h4>
          <ul class="body-list">
            <li>5-day forecast pulled daily</li>
            <li>Historical weather-to-revenue correlation tracked per location</li>
            <li>Rainy-day multiplier applied to revenue forecast when precipitation exceeds threshold</li>
            <li>Weighted at approximately <strong>10%</strong> of forecast when data is available</li>
          </ul>

          <h4 class="subsection-title">Reservations (Resy)</h4>
          <ul class="body-list">
            <li>Upcoming covers pulled from Resy daily at <strong>9:00 AM EST</strong></li>
            <li>Walk-in ratio estimated from historical reservation-to-actual-cover ratio</li>
            <li>Weighted at approximately <strong>15%</strong> of forecast when data is available</li>
          </ul>

          <h4 class="subsection-title">Signal Availability</h4>
          <p class="body-text">Both external signals are optional. When unavailable, their weight is redistributed proportionally to the four core signals. Confidence score adjusts downward when external data is missing.</p>
        </div>
      </details>

      <!-- 11. Covers & Average Check -->
      <details id="covers-check" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">11</span>
          Covers & Average Check
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Cover Calculation</h4>
          <p class="body-text">Projected covers are derived from the forecast:</p>
          <div class="formula-box">
            Projected Covers = Forecast Revenue / Trailing 2-Week Average Check
          </div>

          <h4 class="subsection-title">Manager Workflow</h4>
          <p class="body-text">Managers set revenue only during the forecast acceptance process. Cover counts are auto-calculated and displayed as a reference; they do not need to be manually entered.</p>

          <h4 class="subsection-title">Average Check Computation</h4>
          <p class="body-text">Average check is calculated as:</p>
          <div class="formula-box">
            Avg Check = SUM(revenue) / SUM(covers) over prior 14 days where revenue > 0
          </div>
          <p class="body-text">Only days with actual revenue are included. If fewer than 7 qualifying days exist in the trailing 14-day window, the system falls back to a <strong>$70 default</strong>.</p>
        </div>
      </details>

      <!-- 12. Period-to-Date (PTD) Totals -->
      <details id="ptd-totals" class="principles-section leo-card">
        <summary class="section-header">
          <span class="section-number">12</span>
          Period-to-Date (PTD) Totals
        </summary>
        <div class="section-body">
          <h4 class="subsection-title">Actuals-Only Summation</h4>
          <p class="body-text">Dashboard totals (weekly, period, monthly) only sum days that have actual sales data. This prevents mixing real actuals with zeros or unfulfilled forecasts, which would produce misleading running totals.</p>

          <h4 class="subsection-title">Monthly Report Distinction</h4>
          <p class="body-text">The monthly report provides two views:</p>
          <ul class="body-list">
            <li><strong>MTD (Month-to-Date):</strong> Sum of actuals only, for days that have occurred and been synced</li>
            <li><strong>Full Month Total:</strong> Actuals for past days + forecast for remaining future days, giving a projected month-end picture</li>
          </ul>
          <p class="body-text">This dual view allows operators to see both current reality and expected outcome for planning purposes.</p>
        </div>
      </details>

    </div>

    <!-- Footer -->
    <div class="mt-8 pt-6 border-t border-gray-200 text-center">
      <p class="text-xs text-gray-400">Method Co KPI Dashboard -- Principles Reference v1.0</p>
      <p class="text-xs text-gray-400 mt-1">Last updated: March 2026</p>
    </div>
  </div>
{/if}

<style>
  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    color: #1e3a5f;
    user-select: none;
    list-style: none;
  }
  .section-header::-webkit-details-marker {
    display: none;
  }
  .section-header::after {
    content: '';
    margin-left: auto;
    width: 8px;
    height: 8px;
    border-right: 2px solid #9ca3af;
    border-bottom: 2px solid #9ca3af;
    transform: rotate(45deg);
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  details[open] > .section-header::after {
    transform: rotate(-135deg);
  }
  .section-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: #1e3a5f;
    color: white;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .section-body {
    padding: 0 20px 20px 60px;
  }
  .subsection-title {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-top: 16px;
    margin-bottom: 6px;
  }
  .subsection-title:first-child {
    margin-top: 0;
  }
  .body-text {
    font-size: 14px;
    line-height: 1.65;
    color: #4b5563;
    margin-top: 4px;
  }
  .body-list {
    margin-top: 4px;
    padding-left: 20px;
    list-style: disc;
  }
  .body-list li {
    font-size: 14px;
    line-height: 1.65;
    color: #4b5563;
    margin-top: 2px;
  }
  .signal-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    margin-bottom: 4px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .tag {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    background: #f1f5f9;
    color: #1e3a5f;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid #e2e8f0;
  }
  .code-inline {
    background: #f1f5f9;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 13px;
    font-family: 'SFMono-Regular', Menlo, monospace;
    color: #1e3a5f;
  }
  .formula-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #1e3a5f;
    padding: 10px 16px;
    margin: 8px 0;
    font-size: 14px;
    font-weight: 500;
    color: #1e3a5f;
    border-radius: 0 6px 6px 0;
    font-family: 'SFMono-Regular', Menlo, monospace;
  }
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-top: 8px;
    padding-left: 4px;
  }
  .timeline-step {
    display: flex;
    gap: 14px;
    padding: 10px 0;
    border-left: 2px solid #e5e7eb;
    padding-left: 16px;
    position: relative;
  }
  .timeline-step:last-child {
    border-left-color: transparent;
  }
  .timeline-dot {
    position: absolute;
    left: -6px;
    top: 14px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #1e3a5f;
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .section-body {
      padding: 0 16px 16px 16px;
    }
    .section-header {
      padding: 14px 16px;
      font-size: 14px;
    }
  }
</style>
