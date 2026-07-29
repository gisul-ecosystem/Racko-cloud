import type { OrgAdminConsumptionReport } from '../types/orgAdmin';
import { formatCurrency } from './formatters';

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return 'th';
  }
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatDayColumn(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDate();
  const month = date.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  return `${day}${getOrdinalSuffix(day)} ${month}`;
}

function formatReportCost(value: number, currency: string): string {
  return formatCurrency(value, currency || 'INR');
}

function applyFooterRowStyles(
  sheet: Record<string, unknown>,
  footerRowIndex: number,
  columnCount: number,
  encodeCell: (address: { r: number; c: number }) => string
) {
  for (let column = 0; column < columnCount; column += 1) {
    const cellAddress = encodeCell({ r: footerRowIndex, c: column });
    const cell = sheet[cellAddress] as { s?: Record<string, unknown> } | undefined;
    if (!cell) {
      continue;
    }

    const isGrandTotalCell = column === columnCount - 1;
    cell.s = {
      font: { bold: true },
      ...(isGrandTotalCell
        ? {
            fill: {
              patternType: 'solid',
              fgColor: { rgb: 'FFFF00' },
            },
          }
        : {}),
    };
  }
}

export async function downloadConsumptionReportExcel(
  report: OrgAdminConsumptionReport,
  filenamePrefix = 'consumption-report'
): Promise<void> {
  const XLSX = await import('xlsx-js-style');
  const currency = report.currency || 'INR';
  const dayColumns = report.days.map((day) => formatDayColumn(day));
  const header = ['User', ...dayColumns, 'total'];

  const bodyRows = report.users.map((user) => [
    user.username,
    ...report.days.map((day) => formatReportCost(user.dailyCosts[day] ?? 0, currency)),
    formatReportCost(user.total, currency),
  ]);

  const footerRow = [
    'total',
    ...report.days.map((day) => formatReportCost(report.dailyTotals[day] ?? 0, currency)),
    formatReportCost(report.grandTotal, currency),
  ];

  const sheet = XLSX.utils.aoa_to_sheet([header, ...bodyRows, footerRow]);
  const footerRowIndex = 1 + bodyRows.length;
  applyFooterRowStyles(sheet, footerRowIndex, header.length, XLSX.utils.encode_cell);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Consumption');

  const from = report.period.from.replace(/-/g, '');
  const to = report.period.to.replace(/-/g, '');
  XLSX.writeFile(workbook, `${filenamePrefix}-request-${report.requestId}-${from}-${to}.xlsx`);
}
