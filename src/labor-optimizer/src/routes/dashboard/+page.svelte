<script lang="ts">
  let locationId = $state('');
  let locations = $state<{id: string; name: string}[]>([]);
  let periodNumber = $state(0);
  let year = $state(2026);
  let kpiData = $state<any>(null);
  let loading = $state(false);

  // Auto-detect current period and week based on today's date
  function detectCurrentPeriodAndWeek(): { period: number; week: number } {
    const p1Start = new Date('2025-12-29');
    const today = new Date();
    const daysSinceP1 = Math.floor((today.getTime() - p1Start.getTime()) / (1000 * 60 * 60 * 24));
    const period = Math.min(13, Math.max(1, Math.floor(daysSinceP1 / 28) + 1));
    const dayInPeriod = daysSinceP1 % 28;
    const week = Math.min(4, Math.floor(dayInPeriod / 7) + 1);
    return { period, week };
  }

  // Compute current week number for row highlighting
  let currentWeek = $state(0);

  function isCurrentWeekRow(dayIndex: number): boolean {
    if (periodNumber !== detectCurrentPeriodAndWeek().period) return false;
    const weekOfRow = Math.floor(dayIndex / 7) + 1;
    return weekOfRow === currentWeek;
  }

  async function loadLocations() {
    const res = await fetch('/api/v1/locations');
    const data = await res.json();
    locations = data.locations || data || [];
    if (locations.length > 0 && !locationId) {
      locationId = locations[0].id;
      if (periodNumber === 0) {
        const detected = detectCurrentPeriodAndWeek();
        periodNumber = detected.period;
        currentWeek = detected.week;
      }
      await loadKPIs();
    }
  }

  async function loadKPIs() {
    if (!locationId) return;
    loading = true;
    try {
      const res = await fetch(`/api/v1/kpi?locationId=${locationId}&period=${periodNumber}&year=${year}`);
      kpiData = await res.json();
    } catch (e) {
      console.error('Failed to load KPIs:', e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadLocations();
  });

  function fmtDate(d: string | null): string {
    if (!d) return '-';
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  }

  function formatCurrency(n: number | null): string {
    if (n == null) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  function formatPct(n: number | null): string {
    if (n == null) return '-';
    return (n * 100).toFixed(1) + '%';
  }

  /** For revenue variance: positive (actual > target) is good (green) */
  function weekSubtotal(days: any[], weekNum: number): any {
    const start = (weekNum - 1) * 7;
    const weekDays = (days || []).slice(start, start + 7);
    const withActuals = weekDays.filter((d: any) => d.revenue && d.revenue > 0);
    const rev = withActuals.reduce((s: number, d: any) => s + (d.revenue || 0), 0);
    const budRev = withActuals.reduce((s: number, d: any) => s + (d.budgetRevenue || 0), 0);
    const forecast = withActuals.reduce((s: number, d: any) => s + (d.forecastRevenue || 0), 0);
    const covers = withActuals.reduce((s: number, d: any) => s + (d.covers || 0), 0);
    const fohAct = withActuals.reduce((s: number, d: any) => s + (d.foh?.actual || 0), 0);
    const fohProj = withActuals.reduce((s: number, d: any) => s + (d.foh?.projected || 0), 0);
    const fohBud = withActuals.reduce((s: number, d: any) => s + (d.foh?.budget || 0), 0);
    const bohAct = withActuals.reduce((s: number, d: any) => s + (d.boh?.actual || 0), 0);
    const bohProj = withActuals.reduce((s: number, d: any) => s + (d.boh?.projected || 0), 0);
    const bohBud = withActuals.reduce((s: number, d: any) => s + (d.boh?.budget || 0), 0);
    const totalAct = fohAct + bohAct;
    const totalProj = fohProj + bohProj;
    const totalBud = fohBud + bohBud;
    return { rev, budRev, forecast, covers, fohAct, fohProj, fohBud, bohAct, bohProj, bohBud, totalAct, totalProj, totalBud, hasData: withActuals.length > 0, lbrPct: rev > 0 ? totalAct / rev : 0, budLbrPct: budRev > 0 ? totalBud / budRev : 0 };
  }

  function varianceClass(_variance: number): string {
    return '';
  }

  function laborVarClass(_variance: number): string {
    return '';
  }

  let showPct = $state(false);

  function laborVal(dollars: number | null, revenue: number | null): string {
    if (dollars == null || !dollars) return '-';
    if (showPct && revenue && revenue > 0) return ((dollars / revenue) * 100).toFixed(1) + '%';
    return formatCurrency(dollars);
  }

  /** In $ mode: show dollar variance. In % mode: show difference between the two percentages. */
  function laborVarPct(actDollars: number | null, compDollars: number | null, actRev: number | null, compRev: number | null): string {
    if (actDollars == null || !actDollars) return '-';
    if (compDollars == null || !compDollars) return '-';
    if (showPct) {
      const actPct = actRev && actRev > 0 ? (actDollars / actRev) * 100 : 0;
      const compPct = compRev && compRev > 0 ? (compDollars / compRev) * 100 : 0;
      const diff = compPct - actPct;
      return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
    }
    return formatCurrency(compDollars - actDollars);
  }
</script>

<div class="p-3 md:p-4">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
    <div>
      <h1 class="text-xl md:text-2xl font-bold text-[#1a1a1a]">Performance Dashboard</h1>
      <p class="text-sm text-[#6b7280]">Revenue & Labor Performance</p>
    </div>
    <div class="flex flex-wrap items-center gap-2 sm:gap-4">
      <select bind:value={locationId} onchange={loadKPIs} class="leo-select flex-1 sm:flex-none">
        {#each locations as loc}
          <option value={loc.id}>{loc.name}</option>
        {/each}
      </select>
      <select bind:value={periodNumber} onchange={loadKPIs} class="leo-select w-20">
        {#each Array.from({length: 13}, (_, i) => i + 1) as p}
          <option value={p}>P{p}</option>
        {/each}
      </select>
      <span class="text-sm font-medium text-[#374151]">{year}</span>
      <button onclick={() => showPct = !showPct}
        class="text-xs px-3 py-2 rounded transition-colors"
        style="{showPct ? 'background: #1e3a5f; color: white;' : 'background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;'}; min-height: 44px;">
        {showPct ? '% Mode' : '$ Mode'}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-20 text-[#9ca3af]">Loading...</div>
  {:else if kpiData?.summary}
    <!-- Daily Table -->
    <div class="leo-card leo-table-scroll leo-table-freeze">
      <table class="w-full leo-table" style="font-size: 12px;">
        <thead>
          <tr>
            <th class="leo-th" rowspan="2" colspan="2" style="text-align:center; min-width:90px;">Date</th>
            <th class="leo-th" colspan="4" style="text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">Revenue</th>
            <th class="leo-th" colspan="5" style="text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">FOH Labor</th>
            <th class="leo-th" colspan="5" style="text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">BOH Labor</th>
            <th class="leo-th" colspan="5" style="text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">Total Labor</th>
          </tr>
          <tr>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">Act</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Bud</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">For</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">Act</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Proj</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Bud</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">Act</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Proj</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Bud</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center; border-left: 2px solid rgba(255,255,255,0.3);">Act</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Proj</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Bud</th>
            <th class="leo-th" style="padding:4px 8px; font-size:10px; text-align:center;">Var</th>
          </tr>
        </thead>
        <tbody>
          {#each kpiData.days || [] as day, dayIdx}
            {@const isWeekEnd = day.dayOfWeek === 0}
            {@const inCurrentWeek = isCurrentWeekRow(dayIdx)}
            {@const budVar = day.revenue != null && day.budgetRevenue != null ? day.revenue - day.budgetRevenue : null}
            {@const laborPct = day.revenue ? day.totalLabor.actual / day.revenue : null}
            {@const budLaborPct = day.budgetRevenue ? day.totalLabor.budget / day.budgetRevenue : null}
            {@const fohPVar = day.foh.actual && day.foh.projected ? day.foh.projected - day.foh.actual : null}
            {@const fohBVar = day.foh.actual ? day.foh.budget - day.foh.actual : null}
            {@const bohPVar = day.boh.actual && day.boh.projected ? day.boh.projected - day.boh.actual : null}
            {@const bohBVar = day.boh.actual ? day.boh.budget - day.boh.actual : null}
            <tr class="{inCurrentWeek ? 'leo-current-week' : ''}">
              <td class="leo-td text-[#6b7280]" style="font-size:11px;">{day.dayName?.slice(0,3)}</td>
              <td class="leo-td text-[#9ca3af]" style="font-size:11px;">{fmtDate(day.date)}</td>
              <td class="leo-td font-medium" style="border-left: 2px solid #e5e7eb;">{formatCurrency(day.revenue)}</td>
              <td class="leo-td">{formatCurrency(day.budgetRevenue)}</td>
              <td class="leo-td">{budVar != null ? formatCurrency(budVar) : '-'}</td>
              <td class="leo-td">{formatCurrency(day.forecastRevenue)}</td>
              <!-- FOH: Act | Proj | Var | Bud | Var -->
              <td class="leo-td" style="border-left: 2px solid #e5e7eb;">{laborVal(day.foh.actual, day.revenue)}</td>
              <td class="leo-td">{laborVal(day.foh.projected, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(day.foh.actual, day.foh.projected, day.revenue, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVal(day.foh.budget, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(day.foh.actual, day.foh.budget, day.revenue, day.budgetRevenue)}</td>
              <!-- BOH: Act | Proj | Var | Bud | Var -->
              <td class="leo-td" style="border-left: 2px solid #e5e7eb;">{laborVal(day.boh.actual, day.revenue)}</td>
              <td class="leo-td">{laborVal(day.boh.projected, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(day.boh.actual, day.boh.projected, day.revenue, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVal(day.boh.budget, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(day.boh.actual, day.boh.budget, day.revenue, day.budgetRevenue)}</td>
              <!-- Total: Act | Proj | Var | Bud | Var -->
              <td class="leo-td font-medium" style="border-left: 2px solid #e5e7eb;">{laborVal(day.totalLabor.actual, day.revenue)}</td>
              <td class="leo-td">{laborVal(day.totalLabor.projected, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(day.totalLabor.actual, day.totalLabor.projected, day.revenue, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVal(day.totalLabor.budget, day.budgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(day.totalLabor.actual, day.totalLabor.budget, day.revenue, day.budgetRevenue)}</td>
            </tr>
            {#if isWeekEnd}
              {@const wk = Math.floor(dayIdx / 7) + 1}
              {@const ws = weekSubtotal(kpiData.days, wk)}
              <tr style="background: #f1f5f9; border-bottom: 2px solid #1e3a5f; font-weight: 600;">
                <td class="leo-td font-semibold" colspan="2" style="font-size:11px; color: #1e3a5f;">Week {wk}</td>
                <td class="leo-td font-semibold" style="border-left: 2px solid #cbd5e1;">{formatCurrency(ws.rev || null)}</td>
                <td class="leo-td font-semibold">{formatCurrency(ws.budRev || null)}</td>
                <td class="leo-td font-semibold">{ws.hasData ? formatCurrency(ws.rev - ws.budRev) : '-'}</td>
                <td class="leo-td font-semibold">{formatCurrency(ws.forecast || null)}</td>
                <td class="leo-td font-semibold" style="border-left: 2px solid #cbd5e1;">{laborVal(ws.fohAct, ws.rev)}</td>
                <td class="leo-td">{laborVal(ws.fohProj, ws.budRev)}</td>
                <td class="leo-td">{ws.hasData ? laborVarPct(ws.fohAct, ws.fohProj, ws.rev, ws.budRev) : '-'}</td>
                <td class="leo-td">{laborVal(ws.fohBud, ws.budRev)}</td>
                <td class="leo-td">{ws.hasData ? laborVarPct(ws.fohAct, ws.fohBud, ws.rev, ws.budRev) : '-'}</td>
                <td class="leo-td font-semibold" style="border-left: 2px solid #cbd5e1;">{laborVal(ws.bohAct, ws.rev)}</td>
                <td class="leo-td">{laborVal(ws.bohProj, ws.budRev)}</td>
                <td class="leo-td">{ws.hasData ? laborVarPct(ws.bohAct, ws.bohProj, ws.rev, ws.budRev) : '-'}</td>
                <td class="leo-td">{laborVal(ws.bohBud, ws.budRev)}</td>
                <td class="leo-td">{ws.hasData ? laborVarPct(ws.bohAct, ws.bohBud, ws.rev, ws.budRev) : '-'}</td>
                <td class="leo-td font-semibold" style="border-left: 2px solid #cbd5e1;">{laborVal(ws.totalAct, ws.rev)}</td>
                <td class="leo-td">{laborVal(ws.totalProj, ws.budRev)}</td>
                <td class="leo-td">{ws.hasData ? laborVarPct(ws.totalAct, ws.totalProj, ws.rev, ws.budRev) : '-'}</td>
                <td class="leo-td">{laborVal(ws.totalBud, ws.budRev)}</td>
                <td class="leo-td">{ws.hasData ? laborVarPct(ws.totalAct, ws.totalBud, ws.rev, ws.budRev) : '-'}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
        {#if kpiData.summary}
          <tfoot>
            <tr class="leo-footer">
              <td class="leo-td font-semibold" colspan="2">PTD Total</td>
              <td class="leo-td font-semibold" style="border-left: 2px solid #e5e7eb;">{formatCurrency(kpiData.summary.totalRevenue)}</td>
              <td class="leo-td">{formatCurrency(kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{formatCurrency(kpiData.summary.budgetRevenueVariance)}</td>
              <td class="leo-td">{formatCurrency(kpiData.summary.totalForecast)}</td>
              <!-- FOH -->
              <td class="leo-td" style="border-left: 2px solid #e5e7eb;">{laborVal(kpiData.summary.foh.actual, kpiData.summary.totalRevenue)}</td>
              <td class="leo-td">{laborVal(kpiData.summary.foh.projected, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(kpiData.summary.foh.actual, kpiData.summary.foh.projected, kpiData.summary.totalRevenue, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVal(kpiData.summary.foh.budget, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(kpiData.summary.foh.actual, kpiData.summary.foh.budget, kpiData.summary.totalRevenue, kpiData.summary.totalBudgetRevenue)}</td>
              <!-- BOH -->
              <td class="leo-td" style="border-left: 2px solid #e5e7eb;">{laborVal(kpiData.summary.boh.actual, kpiData.summary.totalRevenue)}</td>
              <td class="leo-td">{laborVal(kpiData.summary.boh.projected, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(kpiData.summary.boh.actual, kpiData.summary.boh.projected, kpiData.summary.totalRevenue, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVal(kpiData.summary.boh.budget, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(kpiData.summary.boh.actual, kpiData.summary.boh.budget, kpiData.summary.totalRevenue, kpiData.summary.totalBudgetRevenue)}</td>
              <!-- Total -->
              <td class="leo-td" style="border-left: 2px solid #e5e7eb;">{laborVal(kpiData.summary.totalLaborActual, kpiData.summary.totalRevenue)}</td>
              <td class="leo-td">{laborVal(kpiData.summary.totalLaborProjected, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(kpiData.summary.totalLaborActual, kpiData.summary.totalLaborProjected, kpiData.summary.totalRevenue, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVal(kpiData.summary.totalLaborBudget, kpiData.summary.totalBudgetRevenue)}</td>
              <td class="leo-td">{laborVarPct(kpiData.summary.totalLaborActual, kpiData.summary.totalLaborBudget, kpiData.summary.totalRevenue, kpiData.summary.totalBudgetRevenue)}</td>
            </tr>
          </tfoot>
        {/if}
      </table>
    </div>

  {:else}
    <div class="text-center py-20">
      <p class="text-[#9ca3af] mb-4">No data available for this period</p>
      <a href="/setup" class="leo-btn inline-block">Set up a location</a>
    </div>
  {/if}
</div>
