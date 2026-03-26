<script lang="ts">
  import { getClientSupabase } from '$lib/supabase-client';

  let locationId = $state('');
  let locations = $state<{id: string; name: string}[]>([]);
  let forecasts = $state<any[]>([]);
  let modelStats = $state<{mape4w: number | null; adaptiveWeights: {trailing: number; pyGrowth: number; momentum: number; budget: number}; trendNotes: string[]; accuracyRecords: number} | null>(null);
  let loading = $state(false);
  let overrideIdx = $state<number | null>(null);
  let overrideRevenue = $state(0);
  let overrideTags = $state<string[]>([]);
  let overrideOtherNote = $state('');
  let year = $state(2026);
  let chartVisible = $state<Record<string, boolean>>({ forecast: true, trailing2w: true, sdly: true, budget: true, actual: true });
  let chartType = $state<'line' | 'bar'>('line');

  const OVERRIDE_TAGS = [
    'Private Event', 'Holiday', 'Emergency Closure', 'Weather',
    'Concert', 'Sporting Event', 'Local Event', 'Theatre',
    'Construction/Road Closure', 'Menu Change', 'Promotion',
    'Staffing Issue', 'Other',
  ];

  function toggleTag(tag: string) {
    if (overrideTags.includes(tag)) {
      overrideTags = overrideTags.filter(t => t !== tag);
      if (tag === 'Other') overrideOtherNote = '';
    } else {
      overrideTags = [...overrideTags, tag];
    }
  }

  function hasValidTags(): boolean {
    if (overrideTags.length === 0) return false;
    if (overrideTags.length === 1 && overrideTags[0] === 'Other' && !overrideOtherNote.trim()) return false;
    return true;
  }
  let currentUserEmail = $state<string | null>(null);

  const ADMIN_EMAILS = ['rr@methodco.com'];

  function isAdmin(): boolean {
    return !!currentUserEmail && ADMIN_EMAILS.includes(currentUserEmail);
  }

  function detectCurrentPeriodAndWeek(): { period: number; week: number } {
    const p1Start = new Date('2025-12-29');
    const today = new Date();
    const daysSinceP1 = Math.floor((today.getTime() - p1Start.getTime()) / (1000 * 60 * 60 * 24));
    const period = Math.min(13, Math.max(1, Math.floor(daysSinceP1 / 28) + 1));
    const dayInPeriod = daysSinceP1 % 28;
    const week = Math.min(4, Math.floor(dayInPeriod / 7) + 1);
    return { period, week };
  }

  const detected = detectCurrentPeriodAndWeek();
  let periodNumber = $state(detected.period);
  let weekFilter = $state(detected.week);

  function getWeekDateRange(period: number, week: number): { start: string; end: string } {
    const p1Start = new Date('2025-12-29');
    const periodStart = new Date(p1Start.getTime() + (period - 1) * 28 * 86400000);
    const weekStart = new Date(periodStart.getTime() + (week - 1) * 7 * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    return {
      start: weekStart.toISOString().split('T')[0],
      end: weekEnd.toISOString().split('T')[0]
    };
  }

  let filteredForecasts = $derived.by(() => {
    if (weekFilter === 0) return forecasts;
    const range = getWeekDateRange(periodNumber, weekFilter);
    return forecasts.filter(f => f.date >= range.start && f.date <= range.end);
  });

  async function loadForecasts() {
    if (!locationId) return;
    loading = true;
    try {
      const periodRes = await fetch(`/api/v1/kpi?locationId=${locationId}&period=${periodNumber}&year=${year}`);
      const periodData = await periodRes.json();
      if (!periodData.period) { loading = false; return; }
      const { startDate, endDate } = periodData.period;
      const res = await fetch(`/api/v1/forecast?locationId=${locationId}&startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      forecasts = data.suggestions || [];
      modelStats = data.modelStats || null;
    } catch (e) { console.error(e); }
    finally { loading = false; }
  }

  async function acceptForecast(idx: number) {
    const f = filteredForecasts[idx];
    const res = await fetch('/api/v1/forecast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, date: f.date, revenue: Math.round(f.suggestedRevenue), isOverride: false, acceptedBy: currentUserEmail || 'manager' }),
    });
    if (res.ok) {
      const r = await res.json();
      // Update the source array
      const srcIdx = forecasts.findIndex(fc => fc.date === f.date);
      if (srcIdx !== -1) {
        forecasts[srcIdx] = { ...f, accepted: true, locked: true, lockedBy: currentUserEmail, managerRevenue: f.suggestedRevenue, targetsGenerated: r.targetsGenerated };
      }
    }
  }

  async function submitOverride(idx: number) {
    const f = filteredForecasts[idx];
    if (!hasValidTags()) return;
    const tags = overrideTags.includes('Other') && overrideOtherNote.trim()
      ? overrideTags.map(t => t === 'Other' ? `Other: ${overrideOtherNote.trim()}` : t)
      : [...overrideTags];
    const res = await fetch('/api/v1/forecast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, date: f.date, revenue: Math.round(overrideRevenue), isOverride: true, overrideTags: tags, acceptedBy: currentUserEmail || 'manager' }),
    });
    if (res.ok) {
      const srcIdx = forecasts.findIndex(fc => fc.date === f.date);
      if (srcIdx !== -1) {
        forecasts[srcIdx] = { ...f, accepted: true, overridden: true, locked: true, lockedBy: currentUserEmail, managerRevenue: overrideRevenue, overrideTags: tags };
      }
      overrideIdx = null;
      overrideTags = [];
      overrideOtherNote = '';
    }
  }

  async function unlockForecast(idx: number) {
    const f = filteredForecasts[idx];
    const res = await fetch('/api/v1/forecast', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, date: f.date, userEmail: currentUserEmail }),
    });
    if (res.ok) {
      const srcIdx = forecasts.findIndex(fc => fc.date === f.date);
      if (srcIdx !== -1) {
        forecasts[srcIdx] = { ...f, locked: false, lockedBy: null, accepted: false };
      }
    }
  }

  async function acceptAllRemaining() {
    for (let i = 0; i < filteredForecasts.length; i++) {
      if (!filteredForecasts[i].accepted && !filteredForecasts[i].locked) await acceptForecast(i);
    }
  }

  function fmt(n: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n); }

  $effect(() => {
    // Load user session
    const supabase = getClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentUserEmail = session?.user?.email ?? null;
    });

    fetch('/api/v1/locations').then(r => r.json()).then(d => {
      locations = d.locations || d || [];
      if (locations.length > 0) { locationId = locations[0].id; loadForecasts(); }
    });
  });
</script>

<div class="p-4 md:p-6 max-w-[1400px] mx-auto">
  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
    <div>
      <h1 class="text-xl md:text-2xl font-bold text-[#1a1a1a]">Forecast Manager</h1>
      <p class="text-sm text-[#6b7280]">AI-suggested forecasts -- accept or override with explanation</p>
      <p class="text-xs text-[#9ca3af] mt-1 hidden sm:block">Accepting triggers threshold cascade: weekly forecast total -> bracket -> position labor targets</p>
    </div>
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <select bind:value={locationId} onchange={loadForecasts} class="leo-select flex-1 sm:flex-none">
        {#each locations as loc}<option value={loc.id}>{loc.name}</option>{/each}
      </select>
      <select bind:value={periodNumber} onchange={loadForecasts} class="leo-select">
        {#each Array.from({length: 13}, (_, i) => i + 1) as p}<option value={p}>P{p}</option>{/each}
      </select>
      <select bind:value={weekFilter} class="leo-select">
        <option value={0}>Full Period</option>
        {#each [1,2,3,4] as w}<option value={w}>W{w}</option>{/each}
      </select>
      <span class="text-sm font-medium text-[#374151]">{year}</span>
      <button onclick={acceptAllRemaining} class="leo-btn w-full sm:w-auto" style="background: #16a34a;" onmouseenter={(e) => e.currentTarget.style.background='#15803d'} onmouseleave={(e) => e.currentTarget.style.background='#16a34a'}>Accept All Remaining</button>
    </div>
  </div>


  {#if loading}<div class="text-center py-20 text-[#9ca3af]">Generating forecasts...</div>
  {:else}
  <div class="leo-card leo-table-scroll">
    <table class="w-full leo-table" style="min-width: 800px;">
      <thead>
        <tr>
          <th class="leo-th">Date</th>
          <th class="leo-th">Day</th>
          <th class="leo-th">Forecast</th>
          <th class="leo-th">Covers</th>
          <th class="leo-th">Avg Check</th>
          <th class="leo-th" style="text-align: center;">Confidence</th>
          <th class="leo-th" style="text-align: left;">Reasoning</th>
          <th class="leo-th">Manager Value</th>
          <th class="leo-th" style="text-align: center;">Status</th>
          <th class="leo-th" style="text-align: center;">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredForecasts as f, i}
          <tr>
            <td class="leo-td" style="text-align: left;">{parseInt(f.date.split('-')[1])}/{parseInt(f.date.split('-')[2])}</td>
            <td class="leo-td text-[#6b7280]" style="text-align: left;">{new Date(f.date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short'})}</td>
            <td class="leo-td font-medium">{fmt(Math.round(f.suggestedRevenue))}</td>
            <td class="leo-td text-[#6b7280]">{f.suggestedCovers}</td>
            <td class="leo-td text-[#9ca3af]" style="font-size: 12px;">{fmt(Math.round(f.avgCheck || 70))}</td>
            <td class="leo-td" style="text-align: center;">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-medium"
                style="{f.confidence >= 0.7 ? 'background: #dcfce7; color: #16a34a;' : f.confidence >= 0.5 ? 'background: #fef9c3; color: #a16207;' : 'background: #fef2f2; color: #dc2626;'}">
                {(f.confidence * 100).toFixed(0)}%
              </span>
            </td>
            <td class="leo-td text-[#6b7280] max-w-xs truncate" style="text-align: left; font-size: 12px;" title={f.reasoning}>{f.reasoning}</td>
            <td class="leo-td">
              {#if f.accepted}<span class="font-medium" style="{f.overridden ? 'color: #ea580c;' : ''}">{fmt(Math.round(f.managerRevenue || f.suggestedRevenue))}</span>{:else}-{/if}
            </td>
            <td class="leo-td" style="text-align: center;">
              {#if f.locked}
                <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium" style="background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  Locked
                </span>
              {:else if f.accepted && f.overridden}
                <div class="flex flex-wrap gap-1 justify-center">
                  {#if f.overrideTags && f.overrideTags.length > 0}
                    {#each f.overrideTags as tag}
                      <span class="inline-block rounded-xl font-medium" style="background: #1e3a5f; color: white; padding: 2px 10px; font-size: 11px;">{tag}</span>
                    {/each}
                  {:else}
                    <span class="text-xs px-2 py-0.5 rounded font-medium" style="background: #fff7ed; color: #ea580c;">Override</span>
                  {/if}
                </div>
              {:else if f.accepted}
                <span class="text-xs px-2 py-0.5 rounded font-medium" style="background: #dcfce7; color: #16a34a;">Accepted</span>
              {:else}
                <span class="text-xs px-2 py-0.5 rounded font-medium" style="background: #f3f4f6; color: #6b7280;">Pending</span>
              {/if}
            </td>
            <td class="leo-td" style="text-align: center;">
              {#if f.locked}
                {#if isAdmin()}
                  <button onclick={() => unlockForecast(i)} class="text-xs font-medium px-2 py-1 rounded transition-colors" style="background: #374151; color: white;" onmouseenter={(e) => e.currentTarget.style.background='#1f2937'} onmouseleave={(e) => e.currentTarget.style.background='#374151'}>
                    Unlock
                  </button>
                {:else}
                  <span class="text-xs text-[#9ca3af]">--</span>
                {/if}
              {:else if !f.accepted}
                <div class="flex gap-1 justify-center">
                  <button onclick={() => acceptForecast(i)} class="text-xs font-medium px-2 py-1 rounded transition-colors" style="background: #16a34a; color: white;" onmouseenter={(e) => e.currentTarget.style.background='#15803d'} onmouseleave={(e) => e.currentTarget.style.background='#16a34a'}>Accept</button>
                  <button onclick={() => { overrideIdx = i; overrideRevenue = f.suggestedRevenue; }} class="text-xs font-medium px-2 py-1 rounded transition-colors" style="background: #ea580c; color: white;" onmouseenter={(e) => e.currentTarget.style.background='#c2410c'} onmouseleave={(e) => e.currentTarget.style.background='#ea580c'}>Override</button>
                </div>
              {/if}
            </td>
          </tr>
          {#if overrideIdx === i}
          <tr style="background: #fff7ed;"><td colspan="10" class="px-3 py-3" style="border-bottom: 1px solid #e5e7eb;">
            <div class="flex items-end gap-4 mb-2">
              <div><label class="text-xs text-[#6b7280]">Revenue</label><input bind:value={overrideRevenue} type="number" class="leo-select w-32 block mt-1" /></div>
              <div><label class="text-xs text-[#9ca3af]">Covers: {f.avgCheck > 0 ? Math.round(overrideRevenue / f.avgCheck) : '--'}</label></div>
            </div>
            <div class="mb-2">
              <label class="text-xs text-[#6b7280] block mb-1">Reason (select one or more)</label>
              <div class="flex flex-wrap gap-1.5">
                {#each OVERRIDE_TAGS as tag}
                  <button
                    type="button"
                    onclick={() => toggleTag(tag)}
                    class="rounded-xl text-xs font-medium transition-colors cursor-pointer"
                    style="{overrideTags.includes(tag)
                      ? 'background: #1e3a5f; color: white; padding: 2px 10px; border: 1px solid #1e3a5f;'
                      : 'background: #f3f4f6; color: #374151; padding: 2px 10px; border: 1px solid #d1d5db;'}"
                  >{tag}</button>
                {/each}
              </div>
            </div>
            {#if overrideTags.includes('Other')}
            <div class="mb-2">
              <input bind:value={overrideOtherNote} type="text" placeholder="Describe..." class="leo-select w-64 text-xs" />
            </div>
            {/if}
            <div class="flex items-center gap-3">
              <button onclick={() => submitOverride(i)} disabled={!hasValidTags()} class="leo-btn disabled:opacity-50" style="background: #ea580c;" onmouseenter={(e) => e.currentTarget.style.background='#c2410c'} onmouseleave={(e) => e.currentTarget.style.background='#ea580c'}>Submit</button>
              <button onclick={() => { overrideIdx = null; overrideTags = []; overrideOtherNote = ''; }} class="text-sm text-[#6b7280]">Cancel</button>
            </div>
          </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Comparison Chart -->
  {#if filteredForecasts.length > 0}
  {@const chartSeries = [
    { key: 'forecast', label: 'Forecast', color: '#1e3a5f', dash: '', width: 2 },
    { key: 'trailing2w', label: 'Trailing 2-Wk Avg', color: '#60a5fa', dash: '6,3', width: 1.5 },
    { key: 'sdly', label: 'SDLY', color: '#93c5fd', dash: '6,3', width: 1.5 },
    { key: 'budget', label: 'Budget', color: '#9ca3af', dash: '3,3', width: 1.5 },
    { key: 'actual', label: 'Actual', color: '#2563eb', dash: '', width: 2.5 },
  ]}
  {@const chartW = 900}
  {@const chartH = 300}
  {@const padL = 75}
  {@const padR = 20}
  {@const padT = 20}
  {@const padB = 40}
  {@const plotW = chartW - padL - padR}
  {@const plotH = chartH - padT - padB}
  {@const chartData = filteredForecasts.map((f, i) => {
    const forecastVal = overrideIdx === i ? (overrideRevenue || f.suggestedRevenue) : (f.managerRevenue ?? f.suggestedRevenue ?? 0);
    return {
      date: f.date,
      dayLabel: new Date(f.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: parseInt(f.date.split('-')[1]) + '/' + parseInt(f.date.split('-')[2]),
      forecast: forecastVal,
      trailing2w: f.trailing2wAvg ?? f.components?.trailingDowAvg ?? null,
      sdly: f.samePeriodPY ?? f.components?.pyAdjusted ?? null,
      budget: f.budgetRevenue ?? f.components?.budgetRevenue ?? null,
      actual: f.actualRevenue ?? null,
    };
  })}
  {@const allVals = chartData.flatMap(d => [d.forecast, d.trailing2w, d.sdly, d.budget, d.actual].filter(v => v != null && v > 0) as number[])}
  {@const chartMax = allVals.length > 0 ? Math.ceil(Math.max(...allVals) / 1000) * 1000 : 10000}
  {@const chartMin = 0}
  {@const yRange = chartMax - chartMin || 1}
  {@const gridCount = 5}
  {@const xStep = chartData.length > 1 ? plotW / (chartData.length - 1) : plotW}

  <div class="leo-card mt-4" style="border: 1px solid #1e3a5f; background: white; padding: 16px;">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-[#1a1a1a]">Forecast Comparison</h3>
      <div class="flex items-center gap-1 rounded-lg overflow-hidden" style="border: 1px solid #d1d5db;">
        <button type="button" onclick={() => { chartType = 'line'; }}
          class="px-3 py-1 text-xs font-medium"
          style="background: {chartType === 'line' ? '#1e3a5f' : 'white'}; color: {chartType === 'line' ? 'white' : '#6b7280'};">
          Line
        </button>
        <button type="button" onclick={() => { chartType = 'bar'; }}
          class="px-3 py-1 text-xs font-medium"
          style="background: {chartType === 'bar' ? '#1e3a5f' : 'white'}; color: {chartType === 'bar' ? 'white' : '#6b7280'};">
          Bar
        </button>
      </div>
    </div>
    <!-- Toggle pills -->
    <div class="flex flex-wrap gap-2 mb-3">
      {#each chartSeries as series}
        <button
          type="button"
          onclick={() => { chartVisible = { ...chartVisible, [series.key]: !chartVisible[series.key] }; }}
          class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer"
          style="background: {series.color}15; color: {series.color}; border: 1px solid {series.color}40; opacity: {chartVisible[series.key] ? '1' : '0.35'};"
        >
          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background: {series.color};"></span>
          {series.label}
        </button>
      {/each}
    </div>

    <!-- SVG Chart -->
    <div class="w-full overflow-x-auto" style="position: relative;">
      <svg viewBox="0 0 {chartW} {chartH}" class="w-full" style="max-height: 340px; min-width: 600px;">
        <!-- Grid lines & Y-axis labels -->
        {#each Array.from({length: gridCount + 1}, (_, i) => i) as gi}
          {@const yVal = chartMin + (yRange * gi / gridCount)}
          {@const yPos = padT + plotH - (plotH * gi / gridCount)}
          <line x1={padL} y1={yPos} x2={chartW - padR} y2={yPos} stroke="#e5e7eb" stroke-width="1" />
          <text x={padL - 8} y={yPos + 4} text-anchor="end" font-size="10" fill="#6b7280">
            {yVal >= 1000 ? '$' + (yVal / 1000).toFixed(0) + 'K' : '$' + yVal.toFixed(0)}
          </text>
        {/each}

        <!-- X-axis labels -->
        {#each chartData as d, i}
          {@const cx = padL + (chartData.length > 1 ? i * xStep : plotW / 2)}
          <text x={cx} y={chartH - 5} text-anchor="middle" font-size="10" fill="#6b7280">
            {d.dayLabel} {d.dateLabel}
          </text>
        {/each}

        <!-- Data series (line or bar) -->
        {#each chartSeries as series, si}
          {@const visibleSeriesCount = chartSeries.filter(s => chartVisible[s.key]).length}
          {@const barGroupWidth = chartData.length > 1 ? xStep * 0.75 : plotW * 0.5}
          {@const singleBarWidth = visibleSeriesCount > 0 ? barGroupWidth / visibleSeriesCount : 0}
          {@const visibleIdx = chartSeries.filter((s, idx) => idx < si && chartVisible[s.key]).length}
          {@const points = chartData.map((d, i) => {
            const val = d[series.key];
            if (val == null || val <= 0) return null;
            const cx = padL + (chartData.length > 1 ? i * xStep : plotW / 2);
            const cy = padT + plotH - (plotH * (val - chartMin) / yRange);
            const barH = plotH * (val - chartMin) / yRange;
            return { x: cx, y: cy, val, barH };
          })}
          {@const validPoints = points.filter(p => p != null)}
          <g data-series={series.key} style="opacity: {chartVisible[series.key] ? '1' : '0'}; transition: opacity 0.2s;">
            {#if chartType === 'line'}
              {#if validPoints.length > 1 && chartVisible[series.key]}
                <polyline
                  fill="none"
                  stroke={series.color}
                  stroke-width={series.width}
                  stroke-dasharray={series.dash}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  points={validPoints.map(p => `${p.x},${p.y}`).join(' ')}
                />
              {/if}
              {#if chartVisible[series.key]}
                {#each validPoints as p}
                  <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={series.color} stroke-width="1.5" />
                {/each}
              {/if}
            {:else}
              {#if chartVisible[series.key]}
                {#each chartData as d, i}
                  {@const val = d[series.key]}
                  {#if val != null && val > 0}
                    {@const cx = padL + (chartData.length > 1 ? i * xStep : plotW / 2)}
                    {@const barH = plotH * (val - chartMin) / yRange}
                    {@const barX = cx - barGroupWidth / 2 + visibleIdx * singleBarWidth}
                    <rect
                      x={barX}
                      y={padT + plotH - barH}
                      width={Math.max(singleBarWidth - 2, 4)}
                      height={barH}
                      fill={series.color}
                      opacity="0.8"
                      rx="1"
                    />
                  {/if}
                {/each}
              {/if}
            {/if}
          </g>
        {/each}

        <!-- Hover targets (invisible wider hit areas per data point) -->
        {#each chartData as d, i}
          {@const cx = padL + (chartData.length > 1 ? i * xStep : plotW / 2)}
          <rect
            x={cx - (chartData.length > 1 ? xStep / 2 : 20)}
            y={padT}
            width={chartData.length > 1 ? xStep : 40}
            height={plotH}
            fill="transparent"
            onmouseenter={(e) => {
              const tip = document.getElementById('chart-tooltip');
              if (!tip) return;
              const lines = [`<b>${d.dayLabel} ${d.dateLabel}</b>`];
              if (chartVisible.forecast && d.forecast > 0) lines.push(`<span style="color:#1e3a5f">Forecast: ${fmt(Math.round(d.forecast))}</span>`);
              if (chartVisible.trailing2w && d.trailing2w != null && d.trailing2w > 0) lines.push(`<span style="color:#16a34a">Trailing 2W: ${fmt(Math.round(d.trailing2w))}</span>`);
              if (chartVisible.sdly && d.sdly != null && d.sdly > 0) lines.push(`<span style="color:#ea580c">SDLY: ${fmt(Math.round(d.sdly))}</span>`);
              if (chartVisible.budget && d.budget != null && d.budget > 0) lines.push(`<span style="color:#6b7280">Budget: ${fmt(Math.round(d.budget))}</span>`);
              if (chartVisible.actual && d.actual != null && d.actual > 0) lines.push(`<span style="color:#3b82f6">Actual: ${fmt(Math.round(d.actual))}</span>`);
              tip.innerHTML = lines.join('<br/>');
              tip.style.display = 'block';
              const svgEl = e.currentTarget.closest('svg');
              const rect = svgEl?.getBoundingClientRect();
              const svgW = rect?.width || chartW;
              const scale = svgW / chartW;
              tip.style.left = `${cx * scale}px`;
              tip.style.top = `${(padT - 5) * scale}px`;
            }}
            onmouseleave={() => {
              const tip = document.getElementById('chart-tooltip');
              if (tip) tip.style.display = 'none';
            }}
          />
        {/each}
      </svg>
      <!-- Tooltip -->
      <div
        id="chart-tooltip"
        style="display:none; position:absolute; background:white; border:1px solid #d1d5db; border-radius:6px; padding:8px 12px; font-size:12px; line-height:1.6; box-shadow:0 2px 8px rgba(0,0,0,0.1); pointer-events:none; transform:translateX(-50%); z-index:10; white-space:nowrap;"
      ></div>
    </div>
  </div>
  {/if}

  {/if}
</div>
