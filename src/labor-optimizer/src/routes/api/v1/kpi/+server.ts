import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase, FOH_POSITIONS, BOH_POSITIONS } from '$lib/server/supabase';

// Map daily_budget column names to dashboard position names
const BUDGET_COL_TO_POSITION: Record<string, string> = {
  server_budget: 'Server',
  bartender_budget: 'Bartender',
  host_budget: 'Host',
  barista_budget: 'Barista',
  support_budget: 'Support',
  training_budget: 'Training',
  line_cooks_budget: 'Line Cooks',
  prep_cooks_budget: 'Prep Cooks',
  pastry_budget: 'Pastry',
  dishwashers_budget: 'Dishwashers',
};

function buildPositionData(dayLabor: any[], dayTargets: any[], budget: any) {
  const allPositions = [...FOH_POSITIONS, ...BOH_POSITIONS];
  return allPositions.map(pos => {
    // Sum ALL labor entries for this position (multiple toast jobs map to same position)
    const laborRows = dayLabor.filter(l => l.mapped_position === pos);
    const actualSum = laborRows.reduce((s: number, l: any) => s + (l.labor_dollars || 0), 0);
    const targetRow = dayTargets.find(t => t.position === pos);
    const budgetCol = Object.entries(BUDGET_COL_TO_POSITION).find(([, p]) => p === pos)?.[0];
    const budgetVal = budget && budgetCol ? (budget[budgetCol] || 0) : 0;
    return {
      position: pos,
      actual: actualSum,
      projected: targetRow?.projected_labor_dollars || 0,
      budget: budgetVal,
    };
  });
}

export const GET: RequestHandler = async ({ url }) => {
  const sb = getSupabase();
  const locationId = url.searchParams.get('locationId');
  const periodNumber = url.searchParams.get('period');
  const year = url.searchParams.get('year') || new Date().getFullYear().toString();

  if (!locationId) {
    return json({ error: 'locationId required' }, { status: 400 });
  }

  // Get period date range
  const { data: period } = await sb
    .from('periods')
    .select('*')
    .eq('location_id', locationId)
    .eq('period_number', Number(periodNumber))
    .eq('year', Number(year))
    .single();

  if (!period) {
    return json({ error: 'Period not found' }, { status: 404 });
  }

  // Get daily actuals for the period
  const { data: actuals } = await sb
    .from('daily_actuals')
    .select('*')
    .eq('location_id', locationId)
    .gte('business_date', period.start_date)
    .lte('business_date', period.end_date)
    .order('business_date');

  // Get daily labor (aggregated by position)
  const { data: labor } = await sb
    .from('daily_labor')
    .select('business_date, mapped_position, labor_dollars, regular_hours, overtime_hours')
    .eq('location_id', locationId)
    .gte('business_date', period.start_date)
    .lte('business_date', period.end_date);

  // Get daily labor targets
  const { data: targets } = await sb
    .from('daily_labor_targets')
    .select('business_date, position, projected_labor_dollars, projected_labor_pct')
    .eq('location_id', locationId)
    .gte('business_date', period.start_date)
    .lte('business_date', period.end_date);

  // Get forecasts
  const { data: forecasts } = await sb
    .from('daily_forecasts')
    .select('business_date, manager_revenue, manager_covers, is_override, ai_suggested_revenue')
    .eq('location_id', locationId)
    .gte('business_date', period.start_date)
    .lte('business_date', period.end_date);

  // Get daily budgets
  const { data: budgets } = await sb
    .from('daily_budget')
    .select('business_date, budget_revenue, server_budget, bartender_budget, host_budget, barista_budget, support_budget, training_budget, line_cooks_budget, prep_cooks_budget, pastry_budget, dishwashers_budget')
    .eq('location_id', locationId)
    .gte('business_date', period.start_date)
    .lte('business_date', period.end_date);

  // Build daily rows
  const days: any[] = [];
  const start = new Date(period.start_date + 'T12:00:00');
  const end = new Date(period.end_date + 'T12:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const actual = (actuals || []).find(a => a.business_date === dateStr);
    const forecast = (forecasts || []).find(f => f.business_date === dateStr);
    const dayLabor = (labor || []).filter(l => l.business_date === dateStr);
    const dayTargets = (targets || []).filter(t => t.business_date === dateStr);
    const budget = (budgets || []).find(b => b.business_date === dateStr);

    // Aggregate budget by FOH/BOH
    const fohBudget = budget
      ? (budget.server_budget || 0) + (budget.bartender_budget || 0) + (budget.host_budget || 0)
        + (budget.barista_budget || 0) + (budget.support_budget || 0) + (budget.training_budget || 0)
      : 0;
    const bohBudget = budget
      ? (budget.line_cooks_budget || 0) + (budget.prep_cooks_budget || 0)
        + (budget.pastry_budget || 0) + (budget.dishwashers_budget || 0)
      : 0;

    // Aggregate labor by FOH/BOH
    const fohActual = dayLabor
      .filter(l => FOH_POSITIONS.includes(l.mapped_position as any))
      .reduce((s, l) => s + l.labor_dollars, 0);
    const bohActual = dayLabor
      .filter(l => BOH_POSITIONS.includes(l.mapped_position as any))
      .reduce((s, l) => s + l.labor_dollars, 0);
    const fohProjected = dayTargets
      .filter(t => FOH_POSITIONS.includes(t.position as any))
      .reduce((s, t) => s + t.projected_labor_dollars, 0);
    const bohProjected = dayTargets
      .filter(t => BOH_POSITIONS.includes(t.position as any))
      .reduce((s, t) => s + t.projected_labor_dollars, 0);

    days.push({
      date: dateStr,
      dayOfWeek: d.getDay(),
      dayName: d.toLocaleDateString('en-US', { weekday: 'long' }),
      revenue: actual?.revenue || null,
      budgetRevenue: budget?.budget_revenue || null,
      covers: actual?.covers || null,
      priorYearRevenue: actual?.prior_year_revenue || null,
      priorYearCovers: actual?.prior_year_covers || null,
      forecastRevenue: forecast?.manager_revenue || null,
      forecastCovers: forecast?.manager_covers || null,
      isOverride: forecast?.is_override || false,
      foh: { actual: fohActual, projected: fohProjected, budget: fohBudget, variance: fohActual - fohBudget },
      boh: { actual: bohActual, projected: bohProjected, budget: bohBudget, variance: bohActual - bohBudget },
      totalLabor: {
        actual: fohActual + bohActual,
        projected: fohProjected + bohProjected,
        budget: fohBudget + bohBudget,
        variance: (fohActual + bohActual) - (fohBudget + bohBudget),
      },
      laborByPosition: buildPositionData(dayLabor, dayTargets, budget),
    });
  }

  // Period-to-date totals: only sum days that have actual revenue
  const ptdDays = days.filter(d => d.revenue && d.revenue > 0);
  const totalRevenue = ptdDays.reduce((s, d) => s + (d.revenue || 0), 0);
  const totalBudgetRevenue = ptdDays.reduce((s, d) => s + (d.budgetRevenue || 0), 0);
  const totalForecast = ptdDays.reduce((s, d) => s + (d.forecastRevenue || 0), 0);
  const totalFohActual = ptdDays.reduce((s, d) => s + d.foh.actual, 0);
  const totalBohActual = ptdDays.reduce((s, d) => s + d.boh.actual, 0);
  const totalFohProjected = ptdDays.reduce((s, d) => s + d.foh.projected, 0);
  const totalBohProjected = ptdDays.reduce((s, d) => s + d.boh.projected, 0);
  const totalFohBudget = ptdDays.reduce((s, d) => s + d.foh.budget, 0);
  const totalBohBudget = ptdDays.reduce((s, d) => s + d.boh.budget, 0);
  const totalLaborBudget = totalFohBudget + totalBohBudget;
  const totalCovers = ptdDays.reduce((s, d) => s + (d.covers || 0), 0);

  return json({
    period: {
      number: period.period_number,
      year: period.year,
      startDate: period.start_date,
      endDate: period.end_date,
    },
    summary: {
      daysWithActuals: ptdDays.length,
      totalRevenue,
      totalBudgetRevenue,
      budgetRevenueVariance: totalRevenue - totalBudgetRevenue,
      totalForecast,
      revenueVariance: totalRevenue - totalForecast,
      totalCovers,
      totalLaborActual: totalFohActual + totalBohActual,
      totalLaborProjected: totalFohProjected + totalBohProjected,
      totalLaborBudget,
      laborVariance: (totalFohActual + totalBohActual) - totalLaborBudget,
      laborPct: totalRevenue > 0 ? (totalFohActual + totalBohActual) / totalRevenue : 0,
      budgetLaborPct: totalBudgetRevenue > 0 ? totalLaborBudget / totalBudgetRevenue : 0,
      foh: { actual: totalFohActual, projected: totalFohProjected, budget: totalFohBudget },
      boh: { actual: totalBohActual, projected: totalBohProjected, budget: totalBohBudget },
    },
    days,
  });
};
