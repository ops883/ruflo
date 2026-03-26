<script lang="ts">
  let locationId = $state('');
  let locations = $state<{id: string; name: string}[]>([]);
  let year = $state(2026);
  let kpiData = $state<any>(null);
  const foh = ['Server', 'Bartender', 'Host', 'Barista', 'Support', 'Training'];
  const boh = ['Line Cooks', 'Prep Cooks', 'Pastry', 'Dishwashers'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  let week = $state(detected.week);

  async function load() {
    if (!locationId) return;
    const res = await fetch(`/api/v1/kpi?locationId=${locationId}&period=${periodNumber}&year=${year}`);
    kpiData = await res.json();
  }

  $effect(() => {
    fetch('/api/v1/locations').then(r => r.json()).then(d => {
      locations = d.locations || d || [];
      if (locations.length > 0) { locationId = locations[0].id; load(); }
    });
  });

  function getWeekDays(allDays: any[], w: number): any[] { return (allDays || []).slice((w - 1) * 7, w * 7); }

  function getPositionData(days: any[], pos: string) {
    return days.map(d => {
      const p = (d.laborByPosition || []).find((x: any) => x.position === pos);
      return { actual: p?.actual || 0, projected: p?.projected || 0, budget: p?.budget || 0, hasActual: (p?.actual || 0) > 0 };
    });
  }

  function fmt(n: number): string { return n ? '$' + Math.round(n).toLocaleString() : '-'; }
  function fmtVar(n: number): string { return n === 0 ? '-' : (n > 0 ? '+' : '') + '$' + Math.round(Math.abs(n)).toLocaleString(); }

  /** PTD total: only sum days that have actual data. */
  function ptdTotal(pd: {actual: number; budget: number; projected: number; hasActual: boolean}[], field: 'actual' | 'budget' | 'projected') {
    return pd.filter(d => d.hasActual).reduce((s, d) => s + d[field], 0);
  }
</script>

<div class="p-4 md:p-6 max-w-[1400px] mx-auto">
  <h1 class="text-xl md:text-2xl font-bold text-[#1a1a1a] mb-1">Labor Detail</h1>
  <p class="text-sm text-[#6b7280] mb-6">Position-level weekly breakdown: Actual vs Projected vs Budget</p>
  <div class="flex gap-2 mb-6 flex-wrap items-center">
    <select bind:value={locationId} onchange={load} class="leo-select">
      {#each locations as loc}<option value={loc.id}>{loc.name}</option>{/each}
    </select>
    <select bind:value={periodNumber} onchange={load} class="leo-select">
      {#each Array.from({length:13},(_,i)=>i+1) as p}<option value={p}>P{p}</option>{/each}
    </select>
    {#each [1,2,3,4] as w}
      <button onclick={() => week = w}
        class="px-4 py-2 rounded text-sm font-medium transition-colors"
        style="{week === w ? 'background: #1e3a5f; color: white;' : 'background: white; border: 1px solid #e5e7eb; color: #374151;'}">
        Week {w}
      </button>
    {/each}
    <span class="text-sm font-medium text-[#374151]">{year}</span>
  </div>

  {#if kpiData?.days}
    {@const weekDays = getWeekDays(kpiData.days, week)}
    {@const fohActual = foh.reduce((s, p) => s + getPositionData(weekDays, p).filter(d => d.hasActual).reduce((a, d) => a + d.actual, 0), 0)}
    {@const fohBudget = foh.reduce((s, p) => s + getPositionData(weekDays, p).filter(d => d.hasActual).reduce((a, d) => a + d.budget, 0), 0)}
    {@const fohProj = foh.reduce((s, p) => s + getPositionData(weekDays, p).filter(d => d.hasActual).reduce((a, d) => a + d.projected, 0), 0)}
    {@const bohActual = boh.reduce((s, p) => s + getPositionData(weekDays, p).filter(d => d.hasActual).reduce((a, d) => a + d.actual, 0), 0)}
    {@const bohBudget = boh.reduce((s, p) => s + getPositionData(weekDays, p).filter(d => d.hasActual).reduce((a, d) => a + d.budget, 0), 0)}
    {@const bohProj = boh.reduce((s, p) => s + getPositionData(weekDays, p).filter(d => d.hasActual).reduce((a, d) => a + d.projected, 0), 0)}
    {@const totalActual = fohActual + bohActual}
    {@const totalBudget = fohBudget + bohBudget}
    {@const totalProj = fohProj + bohProj}

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="leo-card p-4" style="border-top: 3px solid #1e3a5f;">
        <p class="text-[10px] uppercase tracking-wider text-[#6b7280] mb-1">FOH Labor</p>
        <p class="text-lg font-bold text-[#1a1a1a]">{fmt(fohActual)}</p>
        <div class="flex gap-3 mt-1 text-[11px]">
          <span class="text-[#6b7280]">Proj: {fmt(fohProj)}</span>
          <span class="text-[#6b7280]">Bud: {fmt(fohBudget)}</span>
          <span style="color: {fohActual - fohBudget > 0 ? '#dc2626' : '#16a34a'};">{fmtVar(fohActual - fohBudget)}</span>
        </div>
      </div>
      <div class="leo-card p-4" style="border-top: 3px solid #1e3a5f;">
        <p class="text-[10px] uppercase tracking-wider text-[#6b7280] mb-1">BOH Labor</p>
        <p class="text-lg font-bold text-[#1a1a1a]">{fmt(bohActual)}</p>
        <div class="flex gap-3 mt-1 text-[11px]">
          <span class="text-[#6b7280]">Proj: {fmt(bohProj)}</span>
          <span class="text-[#6b7280]">Bud: {fmt(bohBudget)}</span>
          <span style="color: {bohActual - bohBudget > 0 ? '#dc2626' : '#16a34a'};">{fmtVar(bohActual - bohBudget)}</span>
        </div>
      </div>
      <div class="leo-card p-4" style="border-top: 3px solid #2563eb;">
        <p class="text-[10px] uppercase tracking-wider text-[#6b7280] mb-1">Total Labor</p>
        <p class="text-lg font-bold text-[#1a1a1a]">{fmt(totalActual)}</p>
        <div class="flex gap-3 mt-1 text-[11px]">
          <span class="text-[#6b7280]">Proj: {fmt(totalProj)}</span>
          <span class="text-[#6b7280]">Bud: {fmt(totalBudget)}</span>
          <span style="color: {totalActual - totalBudget > 0 ? '#dc2626' : '#16a34a'};">{fmtVar(totalActual - totalBudget)}</span>
        </div>
      </div>
    </div>

    {#each [{title:'FOH Positions',positions:foh},{title:'BOH Positions',positions:boh}] as section}
      <h2 class="leo-section-title mt-8 mb-3">{section.title}</h2>
      {#each section.positions as position}
        {@const pd = getPositionData(weekDays, position)}
        {@const tBudget = ptdTotal(pd, 'budget')}
        {@const tProjected = ptdTotal(pd, 'projected')}
        {@const tActual = ptdTotal(pd, 'actual')}
        {@const tVar = tActual - tBudget}
        <div class="leo-card mb-3 overflow-hidden leo-table-scroll">
          <div style="background: #1e3a5f; color: white; padding: 8px 16px; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em;">
            {position}
          </div>
          <table class="w-full leo-table" style="min-width: 600px;">
            <thead>
              <tr>
                <th class="leo-th" style="width: 90px; background: #f1f5f9; color: #374151;"></th>
                {#each weekDays as d, i}
                  <th class="leo-th" style="background: #f1f5f9; color: #374151; font-size: 12px;">
                    {dayLabels[i] || ''}<br/><span style="font-size: 10px; color: #9ca3af; font-weight: 400;">{d.date?.slice(5)}</span>
                  </th>
                {/each}
                <th class="leo-th" style="background: #f1f5f9; color: #1a1a1a; font-weight: 700;">PTD</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="leo-td font-medium text-[#1a1a1a]" style="font-size: 12px;">Actual</td>
                {#each pd as d}<td class="leo-td {d.hasActual ? 'font-medium' : 'text-[#d1d5db]'}" style="font-size: 12px;">{d.hasActual ? fmt(d.actual) : '-'}</td>{/each}
                <td class="leo-td font-bold" style="font-size: 12px;">{fmt(tActual)}</td>
              </tr>
              <tr>
                <td class="leo-td text-[#6b7280]" style="font-size: 12px;">Projected</td>
                {#each pd as d}<td class="leo-td" style="font-size: 12px;">{fmt(d.projected)}</td>{/each}
                <td class="leo-td font-bold" style="font-size: 12px;">{fmt(tProjected)}</td>
              </tr>
              <tr>
                <td class="leo-td text-[#6b7280]" style="font-size: 12px;">Var (A-P)</td>
                {#each pd as d}
                  {@const v = d.hasActual && d.projected ? d.actual - d.projected : 0}
                  <td class="leo-td {!d.hasActual || !d.projected ? 'text-[#d1d5db]' : v < 0 ? 'leo-positive' : v > 0 ? 'leo-negative' : ''}" style="font-size: 12px;">
                    {d.hasActual && d.projected ? fmtVar(v) : '-'}
                  </td>
                {/each}
                <td class="leo-td font-bold {(tActual - tProjected) < 0 ? 'leo-positive' : (tActual - tProjected) > 0 ? 'leo-negative' : ''}" style="font-size: 12px;">
                  {tActual > 0 && tProjected > 0 ? fmtVar(tActual - tProjected) : '-'}
                </td>
              </tr>
              <tr>
                <td class="leo-td text-[#6b7280]" style="font-size: 12px;">Budget</td>
                {#each pd as d}<td class="leo-td" style="font-size: 12px;">{fmt(d.budget)}</td>{/each}
                <td class="leo-td font-bold" style="font-size: 12px;">{fmt(tBudget)}</td>
              </tr>
              <tr>
                <td class="leo-td text-[#6b7280]" style="font-size: 12px;">Var (A-B)</td>
                {#each pd as d}
                  {@const v = d.hasActual ? d.actual - d.budget : 0}
                  <td class="leo-td {!d.hasActual ? 'text-[#d1d5db]' : v < 0 ? 'leo-positive' : v > 0 ? 'leo-negative' : ''}" style="font-size: 12px;">
                    {d.hasActual ? fmtVar(v) : '-'}
                  </td>
                {/each}
                <td class="leo-td font-bold {tVar < 0 ? 'leo-positive' : tVar > 0 ? 'leo-negative' : ''}" style="font-size: 12px;">
                  {tActual > 0 ? fmtVar(tVar) : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      {/each}
    {/each}
  {:else}<div class="text-center py-20 text-[#9ca3af]">Loading...</div>{/if}
</div>
