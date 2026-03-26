/**
 * Schedule Approval API
 *
 * GET:   Fetch weekly schedule status with projected vs scheduled comparison
 * POST:  Submit schedule for approval
 * PUT:   Approve / deny / request revision (admin only)
 * PATCH: Upsert scheduled labor for a position + day (manual entry)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase, FOH_POSITIONS, BOH_POSITIONS } from '$lib/server/supabase';

const ADMIN_EMAILS = ['rr@methodco.com'];

/* ------------------------------------------------------------------ */
/*  GET — weekly schedule with projected vs scheduled by position/day */
/* ------------------------------------------------------------------ */
export const GET: RequestHandler = async ({ url }) => {
  const sb = getSupabase();
  const locationId = url.searchParams.get('locationId');
  const weekStartDate = url.searchParams.get('weekStartDate');

  if (!locationId || !weekStartDate) {
    return json({ error: 'locationId and weekStartDate are required' }, { status: 400 });
  }

  // Compute week end (6 days after start = Sun)
  const wsDate = new Date(weekStartDate + 'T12:00:00');
  const weDate = new Date(wsDate);
  weDate.setDate(weDate.getDate() + 6);
  const weekEndDate = weDate.toISOString().split('T')[0];

  // Fetch schedule record (may not exist yet)
  const { data: schedule } = await sb
    .from('weekly_schedules')
    .select('*')
    .eq('location_id', locationId)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();

  // Fetch projected labor targets for the week
  const { data: targets } = await sb
    .from('daily_labor_targets')
    .select('business_date, position, projected_labor_dollars')
    .eq('location_id', locationId)
    .gte('business_date', weekStartDate)
    .lte('business_date', weekEndDate);

  // Fetch scheduled labor for the week
  const { data: scheduled } = await sb
    .from('scheduled_labor')
    .select('business_date, position, scheduled_dollars, scheduled_hours, source')
    .eq('location_id', locationId)
    .gte('business_date', weekStartDate)
    .lte('business_date', weekEndDate);

  // Build day-by-day position comparison
  const allPositions = [...FOH_POSITIONS, ...BOH_POSITIONS];
  const days: any[] = [];
  let totalProjected = 0;
  let totalScheduled = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(wsDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const dayTargets = (targets || []).filter(t => t.business_date === dateStr);
    const dayScheduled = (scheduled || []).filter(s => s.business_date === dateStr);

    const positions = allPositions.map(pos => {
      const target = dayTargets.find(t => t.position === pos);
      const sched = dayScheduled.find(s => s.position === pos);
      const proj = target?.projected_labor_dollars || 0;
      const sch = sched?.scheduled_dollars || 0;
      totalProjected += proj;
      totalScheduled += sch;
      return {
        position: pos,
        projected: proj,
        scheduled: sch,
        scheduledHours: sched?.scheduled_hours || 0,
        variance: sch - proj,
      };
    });

    days.push({ date: dateStr, dayOfWeek: d.getDay(), positions });
  }

  const variance = totalScheduled - totalProjected;
  const variancePct = totalProjected > 0 ? variance / totalProjected : 0;

  return json({
    schedule: schedule || {
      status: 'draft',
      submitted_by: null,
      submitted_at: null,
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
    },
    days,
    totals: {
      projected: totalProjected,
      scheduled: totalScheduled,
      variance,
      variancePct,
    },
  });
};

/* ------------------------------------------------------------------ */
/*  POST — submit schedule for approval                               */
/* ------------------------------------------------------------------ */
export const POST: RequestHandler = async ({ request }) => {
  const sb = getSupabase();
  const body = await request.json();
  const { locationId, weekStartDate, submittedBy } = body;

  if (!locationId || !weekStartDate) {
    return json({ error: 'locationId and weekStartDate are required' }, { status: 400 });
  }

  // Compute totals from scheduled_labor vs daily_labor_targets
  const wsDate = new Date(weekStartDate + 'T12:00:00');
  const weDate = new Date(wsDate);
  weDate.setDate(weDate.getDate() + 6);
  const weekEndDate = weDate.toISOString().split('T')[0];

  const { data: targets } = await sb
    .from('daily_labor_targets')
    .select('projected_labor_dollars')
    .eq('location_id', locationId)
    .gte('business_date', weekStartDate)
    .lte('business_date', weekEndDate);

  const { data: scheduled } = await sb
    .from('scheduled_labor')
    .select('scheduled_dollars')
    .eq('location_id', locationId)
    .gte('business_date', weekStartDate)
    .lte('business_date', weekEndDate);

  const totalProjected = (targets || []).reduce((s, t) => s + (t.projected_labor_dollars || 0), 0);
  const totalScheduled = (scheduled || []).reduce((s, r) => s + (r.scheduled_dollars || 0), 0);
  const varianceDollars = totalScheduled - totalProjected;
  const variancePct = totalProjected > 0 ? varianceDollars / totalProjected : 0;

  const now = new Date().toISOString();

  // Upsert the weekly_schedules row
  const { data, error } = await sb
    .from('weekly_schedules')
    .upsert(
      {
        location_id: locationId,
        week_start_date: weekStartDate,
        status: 'submitted',
        submitted_by: submittedBy || 'manager',
        submitted_at: now,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        total_scheduled_labor: totalScheduled,
        total_projected_labor: totalProjected,
        variance_dollars: varianceDollars,
        variance_pct: variancePct,
        updated_at: now,
      },
      { onConflict: 'location_id,week_start_date' },
    )
    .select()
    .single();

  if (error) {
    return json({ error: `Failed to submit: ${error.message}` }, { status: 500 });
  }

  return json({ submitted: true, schedule: data });
};

/* ------------------------------------------------------------------ */
/*  PUT — approve / deny / request revision (admin only)              */
/* ------------------------------------------------------------------ */
export const PUT: RequestHandler = async ({ request }) => {
  const sb = getSupabase();
  const body = await request.json();
  const { locationId, weekStartDate, action, reviewedBy, reviewNotes } = body;

  if (!locationId || !weekStartDate || !action) {
    return json({ error: 'locationId, weekStartDate, and action are required' }, { status: 400 });
  }

  if (!['approve', 'deny', 'revision_requested'].includes(action)) {
    return json({ error: 'action must be approve, deny, or revision_requested' }, { status: 400 });
  }

  if (!reviewedBy || !ADMIN_EMAILS.includes(reviewedBy)) {
    return json({ error: 'Only admins can approve or deny schedules.' }, { status: 403 });
  }

  const statusMap: Record<string, string> = {
    approve: 'approved',
    deny: 'denied',
    revision_requested: 'revision_requested',
  };

  const now = new Date().toISOString();

  const { data, error } = await sb
    .from('weekly_schedules')
    .update({
      status: statusMap[action],
      reviewed_by: reviewedBy,
      reviewed_at: now,
      review_notes: reviewNotes || null,
      updated_at: now,
    })
    .eq('location_id', locationId)
    .eq('week_start_date', weekStartDate)
    .select()
    .single();

  if (error) {
    return json({ error: `Failed to update: ${error.message}` }, { status: 500 });
  }

  return json({ updated: true, schedule: data });
};

/* ------------------------------------------------------------------ */
/*  PATCH — upsert scheduled labor (manual entry)                     */
/* ------------------------------------------------------------------ */
export const PATCH: RequestHandler = async ({ request }) => {
  const sb = getSupabase();
  const body = await request.json();
  const { locationId, date, position, scheduledDollars, scheduledHours } = body;

  if (!locationId || !date || !position) {
    return json({ error: 'locationId, date, and position are required' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('scheduled_labor')
    .upsert(
      {
        location_id: locationId,
        business_date: date,
        position,
        scheduled_dollars: scheduledDollars ?? 0,
        scheduled_hours: scheduledHours ?? 0,
        source: 'manual',
      },
      { onConflict: 'location_id,business_date,position' },
    )
    .select()
    .single();

  if (error) {
    return json({ error: `Failed to save: ${error.message}` }, { status: 500 });
  }

  return json({ saved: true, record: data });
};
