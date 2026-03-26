import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSupabase } from '$lib/server/supabase';

const NAVY = '#1e3a5f';
const LIGHT_GRAY = '#f8f9fa';
const MEDIUM_GRAY = '#6b7280';
const RED = '#dc2626';
const GREEN = '#16a34a';

interface InsightsData {
  date: string;
  locationName: string;
  sections: {
    revenueSummary: string;
    coversSummary: string;
    compsAndDiscounts: string;
    salesMix: string;
    pmixMovers: string;
    laborVariance: string;
    laborSavings: string;
    hourlyEfficiency: string;
  };
  metrics: {
    revenue: number;
    budgetRevenue: number;
    forecastRevenue: number;
    covers: number;
    avgCheck: number;
    totalLaborActual: number;
    totalLaborProjected: number;
    laborPctOfRevenue: number;
    targetLaborPct: number;
    revVsBudgetDollars: number;
    revVsBudgetPct: number;
    revVsForecastDollars: number;
    revVsForecastPct: number;
    flaggedPositions: Array<{
      position: string;
      actual: number;
      projected: number;
      varianceDollars: number;
      variancePct: number;
    }>;
    salesMixData: Array<{
      category: string;
      revenue: number;
      pct_of_total: number;
    }>;
    pmixData: Array<{
      item_name: string;
      quantity: number;
      revenue: number;
    }>;
    weather: {
      condition: string;
      description: string;
      tempHigh: number | null;
    } | null;
  };
}

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function formatDatePretty(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Fetches insights data from the insights API and generates a branded PDF report.
 */
export async function generateInsightsPdf(
  locationId: string,
  date: string,
  baseUrl?: string,
): Promise<{ buffer: Buffer; locationName: string }> {
  // Fetch insights data — reuse the same logic as the API
  const sb = getSupabase();

  // Get location name
  const { data: location } = await sb
    .from('locations')
    .select('name')
    .eq('id', locationId)
    .single();

  const locationName = location?.name || 'Unknown Location';

  // Fetch insights via internal API call or direct data assembly
  // We'll fetch data directly to avoid HTTP circular calls in serverless
  const insightsUrl = baseUrl
    ? `${baseUrl}/api/v1/insights?locationId=${locationId}&date=${date}`
    : null;

  let data: InsightsData;

  if (insightsUrl) {
    const res = await fetch(insightsUrl);
    const json = await res.json();
    data = { ...json, locationName, date };
  } else {
    // Direct data fetch — replicate the insights endpoint logic
    data = await fetchInsightsDataDirect(sb, locationId, date, locationName);
  }

  // Build PDF
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // --- Header ---
  doc.setFillColor(30, 58, 95); // Navy
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Method Co', margin, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Daily KPI Insights Report', margin, 19);
  doc.setFontSize(9);
  doc.text(`${locationName}  |  ${formatDatePretty(date)}`, margin, 25);

  y = 35;

  // --- Revenue Summary Card ---
  y = addSectionHeader(doc, 'Revenue Summary', y, margin, contentWidth);
  y = addRevenueCard(doc, data, y, margin, contentWidth);

  // --- Covers & Average Check ---
  y = addSectionHeader(doc, 'Covers & Average Check', y + 4, margin, contentWidth);
  y = addWrappedText(doc, data.sections.coversSummary, y, margin, contentWidth);

  // --- Sales Mix ---
  y = checkPageBreak(doc, y, 50);
  y = addSectionHeader(doc, 'Sales Mix', y + 4, margin, contentWidth);
  if (data.metrics.salesMixData && data.metrics.salesMixData.length > 0) {
    y = addSalesMixTable(doc, data.metrics.salesMixData, y, margin);
  } else {
    y = addWrappedText(doc, data.sections.salesMix, y, margin, contentWidth);
  }

  // --- PMIX Top 5 ---
  y = checkPageBreak(doc, y, 50);
  y = addSectionHeader(doc, 'PMIX Top 5 Movers', y + 4, margin, contentWidth);
  if (data.metrics.pmixData && data.metrics.pmixData.length > 0) {
    y = addPmixTable(doc, data.metrics.pmixData.slice(0, 5), y, margin);
  } else {
    y = addWrappedText(doc, data.sections.pmixMovers, y, margin, contentWidth);
  }

  // --- Labor Variance ---
  y = checkPageBreak(doc, y, 50);
  y = addSectionHeader(doc, 'Labor Variance', y + 4, margin, contentWidth);
  if (data.metrics.flaggedPositions && data.metrics.flaggedPositions.length > 0) {
    y = addLaborVarianceTable(doc, data.metrics, y, margin);
  } else {
    y = addWrappedText(doc, data.sections.laborVariance, y, margin, contentWidth);
  }

  // --- Labor Savings ---
  y = checkPageBreak(doc, y, 30);
  y = addSectionHeader(doc, 'Labor Savings', y + 4, margin, contentWidth);
  y = addWrappedText(doc, data.sections.laborSavings, y, margin, contentWidth);

  // --- Weather ---
  if (data.metrics.weather) {
    y = checkPageBreak(doc, y, 20);
    y = addSectionHeader(doc, 'Weather', y + 4, margin, contentWidth);
    const weatherText = `${data.metrics.weather.description || data.metrics.weather.condition}${data.metrics.weather.tempHigh ? `, high ${Math.round(data.metrics.weather.tempHigh)}°F` : ''}`;
    y = addWrappedText(doc, weatherText, y, margin, contentWidth);
  }

  // --- Footer ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST  |  Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' },
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, locationName };
}

function addSectionHeader(
  doc: jsPDF,
  title: string,
  y: number,
  margin: number,
  contentWidth: number,
): number {
  doc.setFillColor(30, 58, 95);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  return y + 10;
}

function addWrappedText(
  doc: jsPDF,
  text: string,
  y: number,
  margin: number,
  contentWidth: number,
): number {
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(text, contentWidth - 4);
  doc.text(lines, margin + 2, y + 3);
  return y + lines.length * 3.5 + 4;
}

function addRevenueCard(
  doc: jsPDF,
  data: InsightsData,
  y: number,
  margin: number,
  contentWidth: number,
): number {
  const m = data.metrics;
  const colWidth = contentWidth / 3;

  // Revenue row
  const items = [
    { label: 'Actual Revenue', value: fmt(m.revenue), color: NAVY },
    {
      label: 'vs Budget',
      value: `${fmt(m.budgetRevenue)} (${m.revVsBudgetDollars >= 0 ? '+' : ''}${fmt(m.revVsBudgetDollars)})`,
      color: m.revVsBudgetDollars >= 0 ? GREEN : RED,
    },
    {
      label: 'vs Forecast',
      value: `${fmt(m.forecastRevenue)} (${m.revVsForecastDollars >= 0 ? '+' : ''}${fmt(m.revVsForecastDollars)})`,
      color: m.revVsForecastDollars >= 0 ? GREEN : RED,
    },
  ];

  // Draw background
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');

  items.forEach((item, i) => {
    const x = margin + i * colWidth + 4;
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(item.label, x, y + 5);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const rgb = hexToRgb(item.color);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text(item.value, x, y + 12);
    doc.setFont('helvetica', 'normal');
  });

  return y + 22;
}

function addSalesMixTable(
  doc: jsPDF,
  salesMix: Array<{ category: string; revenue: number; pct_of_total: number }>,
  y: number,
  margin: number,
): number {
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Category', 'Revenue', '% of Total']],
    body: salesMix.map((r) => [r.category, fmt(r.revenue), pct(r.pct_of_total)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    theme: 'grid',
  });
  return (doc as any).lastAutoTable.finalY + 2;
}

function addPmixTable(
  doc: jsPDF,
  pmix: Array<{ item_name: string; quantity: number; revenue: number }>,
  y: number,
  margin: number,
): number {
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Item', 'Qty', 'Revenue']],
    body: pmix.map((r) => [r.item_name, r.quantity.toString(), fmt(r.revenue)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    theme: 'grid',
  });
  return (doc as any).lastAutoTable.finalY + 2;
}

function addLaborVarianceTable(
  doc: jsPDF,
  metrics: InsightsData['metrics'],
  y: number,
  margin: number,
): number {
  const flagged = metrics.flaggedPositions;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Position', 'Actual', 'Projected', 'Variance $', '% of Rev']],
    body: flagged.map((fp) => [
      fp.position,
      fmt(fp.actual),
      fmt(fp.projected),
      (fp.varianceDollars >= 0 ? '+' : '') + fmt(fp.varianceDollars),
      pct(fp.variancePct),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    theme: 'grid',
    didParseCell(data: any) {
      if (data.section === 'body' && data.column.index === 3) {
        const val = flagged[data.row.index]?.varianceDollars ?? 0;
        data.cell.styles.textColor = val > 0 ? [220, 38, 38] : [22, 163, 74];
      }
    },
  });

  // Summary row
  const finalY = (doc as any).lastAutoTable.finalY;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Total Labor: ${fmt(metrics.totalLaborActual)} (${pct(metrics.laborPctOfRevenue)} of revenue) | Target: ${pct(metrics.targetLaborPct)}`,
    margin + 2,
    finalY + 5,
  );

  return finalY + 8;
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 15) {
    doc.addPage();
    return 15;
  }
  return y;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Direct data fetch — avoids HTTP circular call in serverless.
 * Mirrors the logic from /api/v1/insights endpoint.
 */
async function fetchInsightsDataDirect(
  sb: any,
  locationId: string,
  date: string,
  locationName: string,
): Promise<InsightsData> {
  const FOH = ['Server', 'Bartender', 'Host', 'Barista', 'Support', 'Training'];
  const BOH = ['Line Cooks', 'Prep Cooks', 'Pastry', 'Dishwashers'];
  const ALL = [...FOH, ...BOH];

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

  const [
    { data: actuals },
    { data: budget },
    { data: forecast },
    { data: labor },
    { data: laborTargets },
    { data: salesMixRows },
    { data: pmixRows },
    { data: loc },
  ] = await Promise.all([
    sb.from('daily_actuals').select('*').eq('location_id', locationId).eq('business_date', date).maybeSingle(),
    sb.from('daily_budget').select('*').eq('location_id', locationId).eq('business_date', date).maybeSingle(),
    sb.from('daily_forecasts').select('*').eq('location_id', locationId).eq('business_date', date).maybeSingle(),
    sb.from('daily_labor').select('*').eq('location_id', locationId).eq('business_date', date),
    sb.from('daily_labor_targets').select('*').eq('location_id', locationId).eq('business_date', date),
    sb.from('daily_sales_mix').select('*').eq('location_id', locationId).eq('business_date', date).order('revenue', { ascending: false }),
    sb.from('daily_pmix').select('*').eq('location_id', locationId).eq('business_date', date).order('revenue', { ascending: false }).limit(20),
    sb.from('locations').select('labor_budget_pct').eq('id', locationId).single(),
  ]);

  const revenue = actuals?.revenue ?? 0;
  const covers = actuals?.covers ?? 0;
  const budgetRevenue = budget?.budget_revenue ?? 0;
  const forecastRevenue = forecast?.manager_revenue ?? forecast?.ai_suggested_revenue ?? 0;
  const sameWeekPYRevenue = actuals?.prior_year_revenue ?? 0;
  const avgCheck = covers > 0 ? revenue / covers : 0;
  const targetLaborPct = loc?.labor_budget_pct ?? 0.30;

  const laborByPosition: Record<string, number> = {};
  for (const row of labor || []) {
    laborByPosition[row.mapped_position] = (laborByPosition[row.mapped_position] || 0) + row.labor_dollars;
  }

  const targetByPosition: Record<string, number> = {};
  for (const row of laborTargets || []) {
    targetByPosition[row.position] = row.projected_labor_dollars;
  }

  const totalLaborActual = Object.values(laborByPosition).reduce((s, v) => s + v, 0);
  const totalLaborProjected = Object.values(targetByPosition).reduce((s, v) => s + v, 0);
  const laborPctOfRevenue = revenue > 0 ? totalLaborActual / revenue : 0;

  const revVsBudgetDollars = revenue - budgetRevenue;
  const revVsBudgetPct = budgetRevenue > 0 ? revVsBudgetDollars / budgetRevenue : 0;
  const revVsForecastDollars = revenue - forecastRevenue;
  const revVsForecastPct = forecastRevenue > 0 ? revVsForecastDollars / forecastRevenue : 0;

  const flaggedPositions: InsightsData['metrics']['flaggedPositions'] = [];
  for (const pos of ALL) {
    const actual = laborByPosition[pos] || 0;
    const projected = targetByPosition[pos] || 0;
    const varianceDollars = actual - projected;
    const variancePct = revenue > 0 ? Math.abs(varianceDollars) / revenue : 0;
    if (variancePct > 0.015) {
      flaggedPositions.push({ position: pos, actual, projected, varianceDollars, variancePct });
    }
  }

  // Build simple narrative sections
  const revenueSummary = `${formatDatePretty(date)} generated ${fmt(revenue)} in net sales vs budget of ${fmt(budgetRevenue)} (${revVsBudgetDollars >= 0 ? '+' : ''}${fmt(revVsBudgetDollars)}) and forecast of ${fmt(forecastRevenue)}.`;
  const coversSummary = `Covers totaled ${covers.toLocaleString()} with an average check of ${fmt(avgCheck)}.`;
  const salesMix = (salesMixRows && salesMixRows.length > 0)
    ? salesMixRows.map((r: any) => `${r.category}: ${fmt(r.revenue)} (${pct(r.pct_of_total)})`).join(', ')
    : 'Sales mix data not yet available.';
  const pmixMovers = (pmixRows && pmixRows.length > 0)
    ? 'Top sellers: ' + pmixRows.slice(0, 5).map((r: any) => `${r.item_name} (qty ${r.quantity}, ${fmt(r.revenue)})`).join('; ')
    : 'PMIX data not yet available.';

  const laborVariance = flaggedPositions.length === 0
    ? 'All positions within 1.5% of projected targets.'
    : flaggedPositions.map(fp => `${fp.position}: ${fmt(fp.actual)} vs ${fmt(fp.projected)} (${fp.varianceDollars > 0 ? 'over' : 'under'} ${fmt(Math.abs(fp.varianceDollars))})`).join('; ');

  let laborSavings = `Total labor ${pct(laborPctOfRevenue)} of revenue (target ${pct(targetLaborPct)}). `;
  if (laborPctOfRevenue > targetLaborPct) {
    const savingsDollars = (laborPctOfRevenue - targetLaborPct) * revenue;
    laborSavings += `Potential savings of ${fmt(savingsDollars)}.`;
  } else {
    laborSavings += 'Labor under target — efficient scheduling.';
  }

  return {
    date,
    locationName,
    sections: {
      revenueSummary,
      coversSummary,
      compsAndDiscounts: '',
      salesMix,
      pmixMovers,
      laborVariance,
      laborSavings,
      hourlyEfficiency: '',
    },
    metrics: {
      revenue,
      budgetRevenue,
      forecastRevenue,
      covers,
      avgCheck,
      totalLaborActual,
      totalLaborProjected,
      laborPctOfRevenue,
      targetLaborPct,
      revVsBudgetDollars,
      revVsBudgetPct,
      revVsForecastDollars,
      revVsForecastPct,
      flaggedPositions,
      salesMixData: salesMixRows || [],
      pmixData: pmixRows || [],
      weather: null,
    },
  };
}
