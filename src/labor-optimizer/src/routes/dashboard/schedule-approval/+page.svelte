<script lang="ts">
  import { getClientSupabase } from '$lib/supabase-client';

  const ADMIN_EMAILS = ['rr@methodco.com'];
  const foh = ['Server', 'Bartender', 'Host', 'Barista', 'Support', 'Training'];
  const boh = ['Line Cooks', 'Prep Cooks', 'Pastry', 'Dishwashers'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let userEmail = $state<string | null>(null);
  let isAdmin = $derived(!!userEmail && ADMIN_EMAILS.includes(userEmail));

  let locationId = $state('');
  let locations = $state<{id: string; name: string}[]>([]);
  let year = $state(2026);

  // Period/week detection (matches other tabs)
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

  let data = $state<any>(null);
  let loading = $state(false);
  let submitting = $state(false);
  let reviewing = $state(false);
  let reviewNotes = $state('');
  let editingCell = $state<string | null>(null);
  let editValue = $state('');

  // Compute weekStartDate from period + week (use noon to avoid timezone shift)
  function getWeekStartDate(): string {
    const p1Start = new Date('2025-12-29T12:00:00');
    const daysOffset = (periodNumber - 1) * 28 + (week - 1) * 7;
    const ws = new Date(p1Start);
    ws.setDate(ws.getDate() + daysOffset);
    return ws.toISOString().split('T')[0];
  }

  async function load() {
    if (!locationId) return;
    loading = true;
    const weekStart = getWeekStartDate();
    const res = await fetch(`/api/v1/schedule-approval?locationId=${locationId}&weekStartDate=${weekStart}`);
    data = await res.json();
    loading = false;
  }

  $effect(() => {
    const supabase = getClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      userEmail = session?.user?.email ?? null;
    });
    fetch('/api/v1/locations').then(r => r.json()).then(d => {
      locations = d.locations || d || [];
      if (locations.length > 0) { locationId = locations[0].id; load(); }
    });
  });

  let showConfirmDialog = $state(false);

  function requestSubmit() {
    showConfirmDialog = true;
  }

  async function submitForApproval() {
    showConfirmDialog = false;
    submitting = true;
    await fetch('/api/v1/schedule-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, weekStartDate: getWeekStartDate(), submittedBy: userEmail }),
    });
    await load();
    submitting = false;
  }

  async function handleReview(action: 'approve' | 'deny' | 'revision_requested') {
    reviewing = true;
    await fetch('/api/v1/schedule-approval', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        weekStartDate: getWeekStartDate(),
        action,
        reviewedBy: userEmail,
        reviewNotes: reviewNotes || null,
      }),
    });
    reviewNotes = '';
    await load();
    reviewing = false;
  }

  async function saveScheduledValue(date: string, position: string, dollars: number) {
    await fetch('/api/v1/schedule-approval', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, date, position, scheduledDollars: dollars, scheduledHours: 0 }),
    });
    editingCell = null;
    editValue = '';
    await load();
  }

  function fmt(n: number): string { return n ? '$' + Math.round(n).toLocaleString() : '-'; }
  function fmtVar(n: number): string { return n === 0 ? '-' : (n > 0 ? '+' : '') + '$' + Math.round(Math.abs(n)).toLocaleString(); }

  function statusLabel(s: string): string {
    const map: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', denied: 'Denied', revision_requested: 'Revision Requested' };
    return map[s] || s;
  }

  function statusStyle(s: string): string {
    const map: Record<string, string> = {
      draft: 'background: #f3f4f6; color: #374151;',
      submitted: 'background: #1e3a5f; color: white;',
      approved: 'background: #16a34a; color: white;',
      denied: 'background: #dc2626; color: white;',
      revision_requested: 'background: #ea580c; color: white;',
    };
    return map[s] || '';
  }

  function varianceColor(scheduled: number, projected: number): string {
    if (!projected || !scheduled) return '';
    const pct = (scheduled - projected) / projected;
    if (pct > 0.10) return 'color: #dc2626; font-weight: 600;';
    if (pct > 0.05) return 'color: #ea580c; font-weight: 600;';
    if (pct < -0.05) return 'color: #16a34a; font-weight: 600;';
    return '';
  }

  // Aggregate helpers
  function dayTotalProjected(dayIdx: number, posNames: string[]): number {
    if (!data?.days?.[dayIdx]) return 0;
    return data.days[dayIdx].positions.filter((p: any) => posNames.includes(p.position)).reduce((s: number, p: any) => s + p.projected, 0);
  }
  function dayTotalScheduled(dayIdx: number, posNames: string[]): number {
    if (!data?.days?.[dayIdx]) return 0;
    return data.days[dayIdx].positions.filter((p: any) => posNames.includes(p.position)).reduce((s: number, p: any) => s + p.scheduled, 0);
  }
  function weekTotalProjected(posNames: string[]): number {
    let t = 0;
    for (let i = 0; i < 7; i++) t += dayTotalProjected(i, posNames);
    return t;
  }
  function weekTotalScheduled(posNames: string[]): number {
    let t = 0;
    for (let i = 0; i < 7; i++) t += dayTotalScheduled(i, posNames);
    return t;
  }

  let status = $derived(data?.schedule?.status || 'draft');
  let canSubmit = $derived(status === 'draft' || status === 'revision_requested');
  let canReview = $derived(isAdmin && status === 'submitted');
</script>

<div class="p-3 md:p-4">
  <div class="flex items-center justify-between mb-1">
    <h1 class="text-xl md:text-2xl font-bold text-[#1a1a1a]">Schedule Approval</h1>
    {#if data?.schedule}
      <span class="px-4 py-1.5 rounded-full text-sm font-semibold" style={statusStyle(status)}>
        {statusLabel(status)}
      </span>
    {/if}
  </div>
  <p class="text-sm text-[#6b7280] mb-6">Compare scheduled labor against AI-projected targets, then submit for approval.</p>

  <!-- Selectors -->
  <div class="flex gap-2 mb-6 flex-wrap items-center">
    <select bind:value={locationId} onchange={load} class="leo-select">
      {#each locations as loc}<option value={loc.id}>{loc.name}</option>{/each}
    </select>
    <select bind:value={periodNumber} onchange={load} class="leo-select">
      {#each Array.from({length:13},(_,i)=>i+1) as p}<option value={p}>P{p}</option>{/each}
    </select>
    {#each [1,2,3,4] as w}
      <button onclick={() => { week = w; load(); }}
        class="px-4 py-2 rounded text-sm font-medium transition-colors"
        style="{week === w ? 'background: #1e3a5f; color: white;' : 'background: white; border: 1px solid #e5e7eb; color: #374151;'}">
        Week {w}
      </button>
    {/each}
    <span class="text-sm font-medium text-[#374151]">{year}</span>
  </div>

  <!-- Integration note -->
  <div class="leo-card p-3 mb-6" style="border-left: 3px solid #1e3a5f; background: #f8fafc;">
    <p class="text-xs text-[#6b7280]">
      <strong class="text-[#1e3a5f]">Dolce TeamWork</strong> — Scheduled labor syncs automatically every Thursday at 1:00 PM EST.
    </p>
  </div>

  {#if loading}
    <div class="text-center py-20 text-[#9ca3af]">Loading...</div>
  {:else if data?.days}
    <!-- Comparison table -->
    {#each [{title:'FOH Positions', positions: foh}, {title:'BOH Positions', positions: boh}] as section}
      <h2 class="leo-section-title mt-6 mb-3">{section.title}</h2>
      <div class="leo-card mb-4 leo-table-scroll">
        <table class="w-full leo-table" style="min-width: 900px;">
          <thead>
            <tr>
              <th class="leo-th" style="width: 110px; text-align: left;">Position</th>
              {#each data.days as day, i}
                <th class="leo-th" style="font-size: 11px; min-width: 110px; text-align: center;" colspan="2">
                  {dayLabels[i]}<br/><span style="font-size: 10px; color: rgba(255,255,255,0.6); font-weight: 400;">{day.date?.slice(5)}</span>
                </th>
              {/each}
              <th class="leo-th" style="font-weight: 700; min-width: 110px; text-align: center;" colspan="2">Week Total</th>
              <th class="leo-th" style="font-weight: 700; width: 80px; text-align: center;">Variance</th>
            </tr>
            <tr>
              <th class="leo-th" style="padding: 4px 8px; font-size: 10px;"></th>
              {#each data.days as _}
                <th class="leo-th" style="padding: 4px 8px; font-size: 10px; text-align: center;">Proj</th>
                <th class="leo-th" style="padding: 4px 8px; font-size: 10px; text-align: center;">Sched</th>
              {/each}
              <th class="leo-th" style="padding: 4px 8px; font-size: 10px; text-align: center;">Proj</th>
              <th class="leo-th" style="padding: 4px 8px; font-size: 10px; text-align: center;">Sched</th>
              <th class="leo-th" style="padding: 4px 8px; font-size: 10px;"></th>
            </tr>
          </thead>
          <tbody>
            {#each section.positions as position}
              {@const weekProj = data.days.reduce((s: number, d: any) => s + (d.positions.find((p: any) => p.position === position)?.projected || 0), 0)}
              {@const weekSched = data.days.reduce((s: number, d: any) => s + (d.positions.find((p: any) => p.position === position)?.scheduled || 0), 0)}
              {@const weekVar = weekSched - weekProj}
              <tr>
                <td class="leo-td font-medium text-[#1a1a1a]" style="font-size: 12px;">{position}</td>
                {#each data.days as day, dayIdx}
                  {@const posData = day.positions.find((p: any) => p.position === position)}
                  <td class="leo-td" style="font-size: 12px; color: #1a1a1a;">{fmt(posData?.projected || 0)}</td>
                  <td class="leo-td" style="font-size: 12px; {varianceColor(posData?.scheduled || 0, posData?.projected || 0)}">
                    {#if editingCell === `${day.date}-${position}` && canSubmit}
                      <input
                        type="number"
                        bind:value={editValue}
                        onblur={() => saveScheduledValue(day.date, position, Number(editValue) || 0)}
                        onkeydown={(e) => { if (e.key === 'Enter') saveScheduledValue(day.date, position, Number(editValue) || 0); if (e.key === 'Escape') { editingCell = null; editValue = ''; } }}
                        class="w-16 px-1 py-0.5 text-xs border rounded"
                        style="border-color: #1e3a5f;"
                      />
                    {:else}
                      <button
                        onclick={() => { if (canSubmit) { editingCell = `${day.date}-${position}`; editValue = String(posData?.scheduled || ''); } }}
                        class="w-full text-center {canSubmit ? 'cursor-pointer hover:bg-blue-50' : ''}"
                        style="font-size: 12px; background: none; border: none; padding: 2px 4px; {posData?.scheduled ? '' : 'color: #d1d5db;'}"
                        disabled={!canSubmit}>
                        {posData?.scheduled ? fmt(posData.scheduled) : '-'}
                      </button>
                    {/if}
                  </td>
                {/each}
                <td class="leo-td font-bold" style="font-size: 12px; color: #1a1a1a;">{fmt(weekProj)}</td>
                <td class="leo-td font-bold" style="font-size: 12px;">{fmt(weekSched)}</td>
                <td class="leo-td font-bold" style="font-size: 12px; {varianceColor(weekSched, weekProj)}">{weekProj || weekSched ? fmtVar(weekVar) : '-'}</td>
              </tr>
            {/each}
            <!-- Section subtotal row -->
            <tr style="background: #f8fafc; border-top: 2px solid #e5e7eb;">
              <td class="leo-td font-bold text-[#1a1a1a]" style="font-size: 12px;">{section.title.includes('FOH') ? 'FOH Total' : 'BOH Total'}</td>
              {#each data.days as _, dayIdx}
                <td class="leo-td font-bold" style="font-size: 12px; color: #1a1a1a;">{fmt(dayTotalProjected(dayIdx, section.positions))}</td>
                <td class="leo-td font-bold" style="font-size: 12px; {varianceColor(dayTotalScheduled(dayIdx, section.positions), dayTotalProjected(dayIdx, section.positions))}">{fmt(dayTotalScheduled(dayIdx, section.positions))}</td>
              {/each}
              <td class="leo-td font-bold" style="font-size: 12px; color: #1a1a1a;">{fmt(weekTotalProjected(section.positions))}</td>
              <td class="leo-td font-bold" style="font-size: 12px;">{fmt(weekTotalScheduled(section.positions))}</td>
              <td class="leo-td font-bold" style="font-size: 12px; {varianceColor(weekTotalScheduled(section.positions), weekTotalProjected(section.positions))}">{fmtVar(weekTotalScheduled(section.positions) - weekTotalProjected(section.positions))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    {/each}

    <!-- Grand total row -->
    <div class="leo-card mb-6 leo-table-scroll">
      <table class="w-full leo-table" style="min-width: 900px;">
        <tbody>
          {#each [{ allPos: [...foh, ...boh] }] as ctx}
          <tr style="background: #f1f5f9; border-top: 2px solid #1e3a5f; font-weight: 600;">
            <td class="leo-td font-bold" style="width: 110px; font-size: 13px; color: #1e3a5f;">TOTAL</td>
            {#each data.days as _, dayIdx}
              <td class="leo-td font-bold" style="font-size: 12px;">{fmt(dayTotalProjected(dayIdx, ctx.allPos))}</td>
              <td class="leo-td font-bold" style="font-size: 12px;">{fmt(dayTotalScheduled(dayIdx, ctx.allPos))}</td>
            {/each}
            <td class="leo-td font-bold" style="font-size: 12px;">{fmt(weekTotalProjected(ctx.allPos))}</td>
            <td class="leo-td font-bold" style="font-size: 12px;">{fmt(weekTotalScheduled(ctx.allPos))}</td>
            <td class="leo-td font-bold" style="font-size: 12px; width: 80px;">{fmtVar(weekTotalScheduled(ctx.allPos) - weekTotalProjected(ctx.allPos))}</td>
          </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Actions -->
    <div class="flex flex-col gap-4">
      {#if canSubmit}
        <div class="flex items-center gap-3">
          <button onclick={requestSubmit} disabled={submitting}
            class="leo-btn" style="background: #1e3a5f; color: white; {submitting ? 'opacity: 0.5;' : ''}">
            {submitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
          {#if status === 'revision_requested'}
            <span class="text-sm text-[#ea580c]">Revision requested — update schedule and resubmit.</span>
          {/if}
        </div>
      {/if}

      {#if canReview}
        <div class="leo-card p-5">
          <h3 class="text-sm font-semibold text-[#1a1a1a] mb-3">Admin Review</h3>
          <textarea bind:value={reviewNotes} placeholder="Review notes (optional)..."
            class="w-full border rounded px-3 py-2 text-sm mb-3" style="border-color: #e5e7eb; min-height: 60px;"></textarea>
          <div class="flex gap-2">
            <button onclick={() => handleReview('approve')} disabled={reviewing}
              class="px-4 py-2 rounded text-sm font-medium" style="background: #16a34a; color: white;">
              {reviewing ? '...' : 'Approve'}
            </button>
            <button onclick={() => handleReview('deny')} disabled={reviewing}
              class="px-4 py-2 rounded text-sm font-medium" style="background: #dc2626; color: white;">
              {reviewing ? '...' : 'Deny'}
            </button>
            <button onclick={() => handleReview('revision_requested')} disabled={reviewing}
              class="px-4 py-2 rounded text-sm font-medium" style="background: #ea580c; color: white;">
              {reviewing ? '...' : 'Request Revision'}
            </button>
          </div>
        </div>
      {/if}

      <!-- Status timeline -->
      {#if data.schedule?.submitted_at || data.schedule?.reviewed_at}
        <div class="leo-card p-5">
          <h3 class="text-sm font-semibold text-[#1a1a1a] mb-3">Status History</h3>
          <div class="space-y-2">
            {#if data.schedule?.submitted_at}
              <div class="flex items-center gap-2 text-sm">
                <span class="w-2 h-2 rounded-full" style="background: #1e3a5f;"></span>
                <span class="text-[#374151]">Submitted by <strong>{data.schedule.submitted_by}</strong></span>
                <span class="text-[#9ca3af]">{new Date(data.schedule.submitted_at).toLocaleString()}</span>
              </div>
            {/if}
            {#if data.schedule?.reviewed_at}
              <div class="flex items-center gap-2 text-sm">
                <span class="w-2 h-2 rounded-full" style="background: {status === 'approved' ? '#16a34a' : status === 'denied' ? '#dc2626' : '#ea580c'};"></span>
                <span class="text-[#374151]">{statusLabel(status)} by <strong>{data.schedule.reviewed_by}</strong></span>
                <span class="text-[#9ca3af]">{new Date(data.schedule.reviewed_at).toLocaleString()}</span>
              </div>
              {#if data.schedule.review_notes}
                <div class="ml-4 p-2 rounded text-sm text-[#6b7280]" style="background: #f3f4f6;">
                  {data.schedule.review_notes}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="text-center py-20 text-[#9ca3af]">Select a location to view schedule.</div>
  {/if}

  <!-- Confirmation Dialog -->
  {#if showConfirmDialog}
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50; display: flex; align-items: center; justify-content: center;">
      <div class="leo-card p-6" style="max-width: 400px; width: 100%;">
        <h3 class="text-lg font-bold text-[#1a1a1a] mb-2">Confirm Submission</h3>
        <p class="text-sm text-[#6b7280] mb-6">Are you sure you want to submit this schedule for approval? Once submitted, it cannot be edited until reviewed.</p>
        <div class="flex justify-end gap-3">
          <button onclick={() => showConfirmDialog = false}
            class="leo-btn-secondary" style="padding: 8px 20px;">Cancel</button>
          <button onclick={submitForApproval}
            class="leo-btn" style="background: #1e3a5f; padding: 8px 20px;">Submit</button>
        </div>
      </div>
    </div>
  {/if}
</div>
