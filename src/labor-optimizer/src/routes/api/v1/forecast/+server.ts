import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  generateForecastSuggestion,
  acceptForecast,
  generatePeriodForecasts,
  getTrailing2WeekAvgCheck,
} from '$lib/server/domain/forecasting/ai-forecast';
import { getModelStats } from '$lib/server/domain/forecasting/forecast-accuracy';
import { getSupabaseService } from '$lib/server/supabase';

const ADMIN_EMAILS = ['rr@methodco.com'];

export const GET: RequestHandler = async ({ url }) => {
  const locationId = url.searchParams.get('locationId');
  const date = url.searchParams.get('date');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  if (!locationId) return json({ error: 'locationId required' }, { status: 400 });

  // Support period+year shorthand → convert to startDate+endDate
  const period = url.searchParams.get('period');
  const year = url.searchParams.get('year');
  let resolvedStart = startDate;
  let resolvedEnd = endDate;
  if (!resolvedStart && period && year) {
    const p = parseInt(period);
    const y = parseInt(year);
    const fyStart = new Date(y - 1, 11, 29); // Dec 29 of prior year
    const pStart = new Date(fyStart);
    pStart.setDate(pStart.getDate() + (p - 1) * 28);
    const pEnd = new Date(pStart);
    pEnd.setDate(pEnd.getDate() + 27);
    resolvedStart = pStart.toISOString().split('T')[0];
    resolvedEnd = pEnd.toISOString().split('T')[0];
  }

  if (resolvedStart && resolvedEnd) {
    const suggestions = await generatePeriodForecasts(locationId, resolvedStart, resolvedEnd);

    // Enrich with locked status
    const sb = getSupabaseService();
    const { data: lockData } = await sb
      .from('daily_forecasts')
      .select('business_date, locked, locked_at, locked_by, override_tags, is_override')
      .eq('location_id', locationId)
      .gte('business_date', resolvedStart)
      .lte('business_date', resolvedEnd);

    const lockMap = new Map<string, { locked: boolean; locked_at: string | null; locked_by: string | null; override_tags: string[] | null; is_override: boolean }>();
    for (const row of lockData || []) {
      lockMap.set(row.business_date, {
        locked: row.locked ?? false,
        locked_at: row.locked_at,
        locked_by: row.locked_by,
        override_tags: row.override_tags ?? null,
        is_override: row.is_override ?? false,
      });
    }

    const enriched = suggestions.map((s: any) => ({
      ...s,
      locked: lockMap.get(s.date)?.locked ?? false,
      lockedAt: lockMap.get(s.date)?.locked_at ?? null,
      lockedBy: lockMap.get(s.date)?.locked_by ?? null,
      overridden: lockMap.get(s.date)?.is_override ?? false,
      overrideTags: lockMap.get(s.date)?.override_tags ?? [],
    }));

    // Include model accuracy stats
    const modelStats = await getModelStats(locationId);

    return json({ suggestions: enriched, modelStats });
  }

  if (!date) return json({ error: 'date or startDate+endDate required' }, { status: 400 });

  const suggestion = await generateForecastSuggestion(locationId, date);
  return json(suggestion);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { locationId, date, revenue, isOverride, overrideExplanation, overrideTags, acceptedBy } = body;

  if (!locationId || !date || revenue == null) {
    return json({ error: 'locationId, date, revenue required' }, { status: 400 });
  }

  if (isOverride && !overrideExplanation && (!overrideTags || overrideTags.length === 0)) {
    return json({ error: 'overrideTags or overrideExplanation required when isOverride is true' }, { status: 400 });
  }

  // Build explanation from tags for backwards compatibility
  const tags: string[] = overrideTags || [];
  const explanation = overrideExplanation || (tags.length > 0 ? tags.join(', ') : null);

  // Check if forecast is already locked
  const sb = getSupabaseService();
  const { data: existing } = await sb
    .from('daily_forecasts')
    .select('locked')
    .eq('location_id', locationId)
    .eq('business_date', date)
    .maybeSingle();

  if (existing?.locked) {
    return json({ error: 'Forecast is locked. An admin must unlock it first.' }, { status: 403 });
  }

  const result = await acceptForecast(
    locationId,
    date,
    revenue,
    isOverride || false,
    explanation,
    acceptedBy || 'manager',
  );

  // After accepting, lock and store tags
  const updatePayload: Record<string, unknown> = {
    locked: true,
    locked_at: new Date().toISOString(),
    locked_by: acceptedBy || 'manager',
  };
  if (tags.length > 0) {
    updatePayload.override_tags = tags;
  }

  await sb
    .from('daily_forecasts')
    .update(updatePayload)
    .eq('location_id', locationId)
    .eq('business_date', date);

  return json({ accepted: true, locked: true, overrideTags: tags, ...result });
};

/** PUT — Unlock a locked forecast (admin only). */
export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { locationId, date, userEmail } = body;

  if (!locationId || !date || !userEmail) {
    return json({ error: 'locationId, date, and userEmail are required' }, { status: 400 });
  }

  if (!ADMIN_EMAILS.includes(userEmail)) {
    return json({ error: 'Only admins can unlock forecasts.' }, { status: 403 });
  }

  const sb = getSupabaseService();
  const { error: updateError } = await sb
    .from('daily_forecasts')
    .update({
      locked: false,
      locked_at: null,
      locked_by: null,
    })
    .eq('location_id', locationId)
    .eq('business_date', date);

  if (updateError) {
    return json({ error: `Failed to unlock: ${updateError.message}` }, { status: 500 });
  }

  return json({ unlocked: true, date, locationId });
};
