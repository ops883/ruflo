<script lang="ts">
  import { getClientSupabase } from '$lib/supabase-client';
  import { goto } from '$app/navigation';

  let locationId = $state('');
  let locations = $state<{ id: string; name: string }[]>([]);
  let weeksBack = $state(4);
  let loading = $state(false);
  let data = $state<any>(null);
  let error = $state('');
  let isAdmin = $state(false);
  let authChecked = $state(false);
  const ADMIN_EMAILS = ['rr@methodco.com'];

  function fmt(n: number | null): string {
    if (n == null) return '-';
    return '$' + Math.round(n).toLocaleString();
  }
  function pct(n: number | null): string {
    if (n == null) return '-';
    return (n * 100).toFixed(1) + '%';
  }
  function shortDate(d: string): string {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function scoreColor(score: number): string {
    if (score >= 80) return '#16a34a';
    if (score >= 60) return '#ca8a04';
    return '#dc2626';
  }
  function mapeColor(mape: number): string {
    if (mape <= 0.08) return '#16a34a';
    if (mape <= 0.15) return '#ca8a04';
    return '#dc2626';
  }
  function mapeBg(mape: number): string {
    if (mape <= 0.08) return '#dcfce7';
    if (mape <= 0.15) return '#fef9c3';
    return '#fee2e2';
  }

  async function loadData() {
    if (!locationId) return;
    loading = true;
    error = '';
    data = null;
    try {
      const params = new URLSearchParams({ locationId, weeksBack: String(weeksBack) });
      const res = await fetch(`/api/v1/admin/forecast-accuracy?${params}`);
      if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
      data = await res.json();
    } catch (e: any) { error = e.message; }
    finally { loading = false; }
  }

  $effect(() => {
    const supabase = getClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email ?? null;
      isAdmin = !!email && ADMIN_EMAILS.includes(email);
      authChecked = true;
      if (!isAdmin) { goto('/dashboard'); return; }
      fetch('/api/v1/locations').then(r => r.json()).then(d => {
        locations = d.locations || d || [];
        if (locations.length > 0) { locationId = locations[0].id; loadData(); }
      });
    });
  });

  // SVG chart helpers
  function barChart(items: { date: string; forecast: number | null; actual: number | null }[]): string {
    const valid = items.filter(i => i.forecast != null || i.actual != null);
    if (valid.length === 0) return '';
    const maxVal = Math.max(...valid.map(i => Math.max(i.forecast ?? 0, i.actual ?? 0)), 1);
    const w = 900, h = 220, pad = 40, barW = Math.min(14, (w - pad * 2) / valid.length / 2.5);
    const xStep = (w - pad * 2) / valid.length;
    let svg = `<svg viewBox="0 0 ${w} ${h + 30}" class="w-full" style="max-height:280px">`;
    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h - pad * 2) * (1 - i / 4);
      const val = Math.round(maxVal * i / 4);
      svg += `<line x1="${pad}" y1="${y}" x2="${w - 10}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`;
      svg += `<text x="${pad - 4}" y="${y + 3}" text-anchor="end" fill="#9ca3af" font-size="9">$${(val / 1000).toFixed(0)}k</text>`;
    }
    valid.forEach((item, idx) => {
      const x = pad + idx * xStep + xStep / 2;
      const fcH = item.forecast != null ? ((item.forecast / maxVal) * (h - pad * 2)) : 0;
      const actH = item.actual != null ? ((item.actual / maxVal) * (h - pad * 2)) : 0;
      const baseY = h - pad;
      if (item.forecast != null) {
        svg += `<rect x="${x - barW - 1}" y="${baseY - fcH}" width="${barW}" height="${fcH}" fill="#1e3a5f" rx="2" opacity="0.7"/>`;
      }
      if (item.actual != null) {
        svg += `<rect x="${x + 1}" y="${baseY - actH}" width="${barW}" height="${actH}" fill="#16a34a" rx="2" opacity="0.7"/>`;
      }
      if (idx % Math.max(1, Math.floor(valid.length / 10)) === 0) {
        svg += `<text x="${x}" y="${h - pad + 14}" text-anchor="middle" fill="#6b7280" font-size="8">${shortDate(item.date)}</text>`;
      }
    });
    // Legend
    svg += `<rect x="${w - 180}" y="6" width="10" height="10" fill="#1e3a5f" rx="2" opacity="0.7"/>`;
    svg += `<text x="${w - 166}" y="15" fill="#374151" font-size="10">Forecast</text>`;
    svg += `<rect x="${w - 100}" y="6" width="10" height="10" fill="#16a34a" rx="2" opacity="0.7"/>`;
    svg += `<text x="${w - 86}" y="15" fill="#374151" font-size="10">Actual</text>`;
    svg += '</svg>';
    return svg;
  }

  function trendLine(items: { week: string; score: number }[]): string {
    if (items.length < 2) return '';
    const w = 500, h = 160, pad = 40;
    const maxScore = 100;
    const xStep = (w - pad * 2) / (items.length - 1);
    let pathD = '';
    items.forEach((item, idx) => {
      const x = pad + idx * xStep;
      const y = pad + (h - pad * 2) * (1 - item.score / maxScore);
      pathD += `${idx === 0 ? 'M' : 'L'}${x},${y}`;
    });
    let svg = `<svg viewBox="0 0 ${w} ${h + 20}" class="w-full" style="max-height:200px">`;
    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad + (h - pad * 2) * (1 - (i * 25) / maxScore);
      svg += `<line x1="${pad}" y1="${y}" x2="${w - 10}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`;
      svg += `<text x="${pad - 4}" y="${y + 3}" text-anchor="end" fill="#9ca3af" font-size="9">${i * 25}</text>`;
    }
    svg += `<path d="${pathD}" fill="none" stroke="#1e3a5f" stroke-width="2.5" stroke-linejoin="round"/>`;
    items.forEach((item, idx) => {
      const x = pad + idx * xStep;
      const y = pad + (h - pad * 2) * (1 - item.score / maxScore);
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#1e3a5f"/>`;
      svg += `<text x="${x}" y="${y - 8}" text-anchor="middle" fill="#374151" font-size="9" font-weight="600">${item.score}</text>`;
      svg += `<text x="${x}" y="${h - pad + 14}" text-anchor="middle" fill="#6b7280" font-size="8">${shortDate(item.week)}</text>`;
    });
    svg += '</svg>';
    return svg;
  }
</script>

{#if !authChecked}
  <div class="p-6"><p class="text-sm text-[#9ca3af]">Checking access...</p></div>
{:else if !isAdmin}
  <div class="p-6"><p class="text-sm text-[#dc2626]">Admin access required</p></div>
{:else}
<div class="p-3 md:p-4">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
    <div>
      <h1 class="text-xl md:text-2xl font-bold text-[#1a1a1a]">Forecast Accuracy</h1>
      <p class="text-sm text-[#6b7280]">Self-grading analytics and improvement insights</p>
    </div>
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <select bind:value={weeksBack} onchange={loadData} class="leo-select">
        <option value={2}>2 weeks</option>
        <option value={4}>4 weeks</option>
        <option value={8}>8 weeks</option>
        <option value={13}>Full period</option>
      </select>
      <select bind:value={locationId} onchange={loadData} class="leo-select flex-1 sm:flex-none">
        {#each locations as loc}<option value={loc.id}>{loc.name}</option>{/each}
      </select>
    </div>
  </div>

  {#if loading}
    <div class="leo-card p-12 text-center"><p class="text-sm text-[#9ca3af]">Loading analytics...</p></div>
  {:else if error}
    <div class="leo-card p-6"><p class="text-sm text-[#dc2626]">{error}</p></div>
  {:else if data}

  <!-- Score Card -->
  <div class="leo-card p-4 md:p-6 mb-6">
    <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
      <!-- Circular Gauge -->
      <div class="flex-shrink-0 relative" style="width:120px;height:120px;">
        {@html (() => {
          const score = data.selfGrading.score;
          const r = 50, c = 60, circ = 2 * Math.PI * r;
          const offset = circ * (1 - score / 100);
          return `<svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="10"/>
            <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${scoreColor(score)}" stroke-width="10"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"
              transform="rotate(-90 ${c} ${c})"/>
            <text x="${c}" y="${c - 6}" text-anchor="middle" font-size="28" font-weight="700" fill="#1a1a1a">${score}</text>
            <text x="${c}" y="${c + 14}" text-anchor="middle" font-size="14" font-weight="600" fill="${scoreColor(score)}">${data.selfGrading.grade}</text>
          </svg>`;
        })()}
      </div>
      <div class="flex-1">
        <div class="flex items-center gap-3 mb-2">
          <span class="text-lg font-semibold text-[#1a1a1a]">Overall Score</span>
          {#if data.selfGrading.trend === 'improving'}
            <span class="text-xs font-medium px-2 py-0.5 rounded" style="background:#dcfce7;color:#16a34a;">Improving</span>
          {:else if data.selfGrading.trend === 'declining'}
            <span class="text-xs font-medium px-2 py-0.5 rounded" style="background:#fee2e2;color:#dc2626;">Declining</span>
          {:else}
            <span class="text-xs font-medium px-2 py-0.5 rounded" style="background:#f3f4f6;color:#6b7280;">Stable</span>
          {/if}
        </div>
        <div class="flex flex-wrap gap-3 sm:gap-6 text-sm text-[#6b7280]">
          <span>MAPE: <strong class="text-[#1a1a1a]">{(data.mape * 100).toFixed(1)}%</strong></span>
          <span>Bias: <strong class="text-[#1a1a1a]">{data.bias >= 0 ? '+' : ''}{(data.bias * 100).toFixed(1)}%</strong></span>
          <span>R2: <strong class="text-[#1a1a1a]">{data.r2.toFixed(2)}</strong></span>
          <span>Forecasts: <strong class="text-[#1a1a1a]">{data.totalForecasts}</strong></span>
          <span>Within 10%: <strong class="text-[#1a1a1a]">{data.withinThreshold['10pct']}/{data.totalForecasts}</strong></span>
        </div>
        {#if data.selfGrading.previousScore}
          <p class="text-xs text-[#9ca3af] mt-1">Previous period score: {data.selfGrading.previousScore}</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Breakdown Cards -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
    {#each [
      { label: 'Accuracy', score: data.selfGrading.breakdown.accuracy, desc: 'Based on MAPE' },
      { label: 'Consistency', score: data.selfGrading.breakdown.consistency, desc: 'Error variance' },
      { label: 'Bias Control', score: data.selfGrading.breakdown.biasControl, desc: 'Systematic drift' },
      { label: 'Improvement', score: data.selfGrading.breakdown.improvement, desc: 'Trend direction' },
      { label: 'Coverage', score: data.selfGrading.breakdown.coverage, desc: 'Forecast completeness' },
    ] as card}
      <div class="leo-card p-4 text-center">
        <p class="text-xs uppercase tracking-wider text-[#6b7280] mb-1">{card.label}</p>
        <p class="text-2xl font-bold" style="color:{scoreColor(card.score)}">{card.score}</p>
        <p class="text-[10px] text-[#9ca3af] mt-1">{card.desc}</p>
      </div>
    {/each}
  </div>

  <!-- Forecast vs Actual Chart -->
  <div class="leo-card p-5 mb-6">
    <h2 class="leo-section-title mb-3">Forecast vs Actual Revenue</h2>
    {#if data.dailyComparison.length > 0}
      {@html barChart(data.dailyComparison)}
    {:else}
      <p class="text-sm text-[#9ca3af] py-8 text-center">No comparison data available</p>
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
    <!-- DOW Heatmap -->
    <div class="leo-card p-4 md:p-5">
      <h2 class="leo-section-title mb-3">Day-of-Week Accuracy</h2>
      <div class="grid grid-cols-7 gap-1">
        {#each data.dowAnalysis as dow}
          <div class="rounded-lg p-3 text-center" style="background:{dow.count > 0 ? mapeBg(dow.mape) : '#f3f4f6'}">
            <p class="text-[10px] font-semibold text-[#374151] uppercase">{dow.dow.slice(0,3)}</p>
            <p class="text-lg font-bold mt-1" style="color:{dow.count > 0 ? mapeColor(dow.mape) : '#9ca3af'}">{dow.grade}</p>
            <p class="text-[10px] text-[#6b7280]">{dow.count > 0 ? (dow.mape * 100).toFixed(0) + '%' : '-'}</p>
          </div>
        {/each}
      </div>
      <div class="flex gap-4 mt-3 text-[10px] text-[#9ca3af]">
        <span><span class="inline-block w-3 h-3 rounded" style="background:#dcfce7"></span> &lt;8%</span>
        <span><span class="inline-block w-3 h-3 rounded" style="background:#fef9c3"></span> 8-15%</span>
        <span><span class="inline-block w-3 h-3 rounded" style="background:#fee2e2"></span> &gt;15%</span>
      </div>
    </div>

    <!-- Weekly Score Trend -->
    <div class="leo-card p-4 md:p-5">
      <h2 class="leo-section-title mb-3">Weekly Score Trend</h2>
      {#if data.weeklyTrend.length >= 2}
        {@html trendLine(data.weeklyTrend)}
      {:else}
        <p class="text-sm text-[#9ca3af] py-8 text-center">Need at least 2 weeks of data</p>
      {/if}
    </div>
  </div>

  <!-- Recommendations -->
  <div class="leo-card p-5 mb-6">
    <h2 class="leo-section-title mb-3">AI Recommendations</h2>
    <div class="space-y-2">
      {#each data.recommendations as rec, i}
        <div class="flex items-start gap-3 py-2 {i < data.recommendations.length - 1 ? 'border-b border-[#e5e7eb]' : ''}">
          <span class="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style="background:#1e3a5f;color:white;">{i + 1}</span>
          <p class="text-sm text-[#374151]">{rec}</p>
        </div>
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
    <!-- Weight History -->
    <div class="leo-card p-4 md:p-5">
      <h2 class="leo-section-title mb-3">Adaptive Weight History</h2>
      {#if data.weightHistory.length > 0}
        <div class="overflow-x-auto">
          <table class="w-full leo-table">
            <thead>
              <tr>
                <th class="leo-th text-left">Date</th>
                <th class="leo-th">Trailing</th>
                <th class="leo-th">PY Growth</th>
                <th class="leo-th">Momentum</th>
                <th class="leo-th">Budget</th>
              </tr>
            </thead>
            <tbody>
              {#each data.weightHistory.slice(-8) as w}
                <tr>
                  <td class="leo-td text-left text-xs">{shortDate(w.date)}</td>
                  <td class="leo-td text-xs">{w.trailing != null ? (w.trailing * 100).toFixed(0) + '%' : '-'}</td>
                  <td class="leo-td text-xs">{w.pyGrowth != null ? (w.pyGrowth * 100).toFixed(0) + '%' : '-'}</td>
                  <td class="leo-td text-xs">{w.momentum != null ? (w.momentum * 100).toFixed(0) + '%' : '-'}</td>
                  <td class="leo-td text-xs">{w.budget != null ? (w.budget * 100).toFixed(0) + '%' : '-'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="text-sm text-[#9ca3af] py-4 text-center">No weight history recorded yet</p>
      {/if}
    </div>

    <!-- Tag Impact -->
    <div class="leo-card p-4 md:p-5">
      <h2 class="leo-section-title mb-3">Override Tag Impact</h2>
      {#if data.tagImpact.length > 0}
        <div class="overflow-x-auto">
          <table class="w-full leo-table">
            <thead>
              <tr>
                <th class="leo-th text-left">Tag</th>
                <th class="leo-th">Uses</th>
                <th class="leo-th">Avg Rev Impact</th>
                <th class="leo-th">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {#each data.tagImpact as t}
                <tr>
                  <td class="leo-td text-left text-xs font-medium">{t.tag}</td>
                  <td class="leo-td text-xs">{t.occurrences}</td>
                  <td class="leo-td text-xs" style="color:{t.avgRevImpact >= 0 ? '#16a34a' : '#dc2626'}">
                    {t.avgRevImpact >= 0 ? '+' : ''}{(t.avgRevImpact * 100).toFixed(1)}%
                  </td>
                  <td class="leo-td text-xs">{(t.forecastAccuracy * 100).toFixed(0)}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="text-sm text-[#9ca3af] py-4 text-center">No override tags used yet</p>
      {/if}
    </div>
  </div>

  <!-- Daily Detail Table -->
  <div class="leo-card p-4 md:p-5 mb-6">
    <h2 class="leo-section-title mb-3">Daily Detail</h2>
    <div class="leo-table-scroll" style="max-height:400px;overflow-y:auto;">
      <table class="w-full leo-table">
        <thead class="sticky top-0">
          <tr>
            <th class="leo-th text-left">Date</th>
            <th class="leo-th">Day</th>
            <th class="leo-th">Trail 2W</th>
            <th class="leo-th">SDLY</th>
            <th class="leo-th">Forecast</th>
            <th class="leo-th">Actual</th>
            <th class="leo-th">Budget</th>
            <th class="leo-th">Error $</th>
            <th class="leo-th">Error %</th>
          </tr>
        </thead>
        <tbody>
          {#each data.dailyComparison as day}
            <tr>
              <td class="leo-td text-left text-xs">{shortDate(day.date)}</td>
              <td class="leo-td text-xs">{day.dayOfWeek.slice(0, 3)}</td>
              <td class="leo-td text-xs text-[#6b7280]">{day.trailing2wAvg ? fmt(day.trailing2wAvg) : '-'}</td>
              <td class="leo-td text-xs text-[#6b7280]">{day.samePeriodPY ? fmt(day.samePeriodPY) : '-'}</td>
              <td class="leo-td text-xs">{fmt(day.forecast)}</td>
              <td class="leo-td text-xs font-medium">{fmt(day.actual)}</td>
              <td class="leo-td text-xs text-[#6b7280]">{fmt(day.budget)}</td>
              <td class="leo-td text-xs" style="color:{day.error != null ? (day.error >= 0 ? '#16a34a' : '#dc2626') : '#9ca3af'}">
                {day.error != null ? (day.error >= 0 ? '+' : '') + '$' + Math.abs(day.error).toLocaleString() : '-'}
              </td>
              <td class="leo-td text-xs" style="color:{day.errorPct != null ? (Math.abs(day.errorPct) <= 0.10 ? '#16a34a' : Math.abs(day.errorPct) <= 0.15 ? '#ca8a04' : '#dc2626') : '#9ca3af'}">
                {day.errorPct != null ? (day.errorPct >= 0 ? '+' : '') + (day.errorPct * 100).toFixed(1) + '%' : '-'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  {/if}
</div>
{/if}
