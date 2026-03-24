/**
 * Export helpers for generating CSV and JSON files
 * Using native methods without external dependencies for security
 */

export interface ExportData {
  headers: string[]
  rows: (string | number | null)[][]
  filename: string
}

/**
 * Generate CSV file from data
 */
export function generateCSV(data: ExportData): void {
  const { headers, rows, filename } = data

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          // Handle null/undefined
          if (cell === null || cell === undefined) return ''
          
          // Convert to string and escape
          const cellStr = String(cell)
          
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`
          }
          
          return cellStr
        })
        .join(',')
    ),
  ].join('\n')

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`)
}

/**
 * Generate JSON file from data
 */
export function generateJSON(data: ExportData): void {
  const { headers, rows, filename } = data

  // Convert to array of objects
  const jsonData = rows.map((row) => {
    const obj: Record<string, string | number | null> = {}
    headers.forEach((header, index) => {
      obj[header] = row[index]
    })
    return obj
  })

  // Create blob and download
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, `${filename}.json`)
}

/**
 * Generate Excel-compatible CSV (with BOM for proper encoding)
 */
export function generateExcelCSV(data: ExportData): void {
  const { headers, rows, filename } = data

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return ''
          const cellStr = String(cell)
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`
          }
          return cellStr
        })
        .join(',')
    ),
  ].join('\n')

  // Add BOM for Excel compatibility
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`)
}

/**
 * Download blob as file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Format analytics data for export
 */
export function formatAnalyticsForExport(
  data: Array<{
    date: string
    pageViews: number
    uniqueVisitors: number
    bounceRate: number
    avgSessionDuration: number
  }>,
  websiteName: string,
  dateRange: { start: string; end: string }
): ExportData {
  return {
    headers: ['Date', 'Page Views', 'Unique Visitors', 'Bounce Rate (%)', 'Avg Session Duration (s)'],
    rows: data.map((row) => [
      row.date,
      row.pageViews,
      row.uniqueVisitors,
      Math.round(row.bounceRate * 100) / 100,
      Math.round(row.avgSessionDuration),
    ]),
    filename: `analytics-${websiteName}-${dateRange.start}-to-${dateRange.end}`,
  }
}

/**
 * Format device data for export
 */
export function formatDeviceDataForExport(
  data: Array<{ name: string; value: number; count: number }>,
  websiteName: string
): ExportData {
  return {
    headers: ['Device', 'Percentage', 'Count'],
    rows: data.map((row) => [row.name, row.value, row.count]),
    filename: `devices-${websiteName}-${new Date().toISOString().split('T')[0]}`,
  }
}

/**
 * Format top pages data for export
 */
export function formatTopPagesForExport(
  data: Array<{ page: string; views: number; percentage: number }>,
  websiteName: string
): ExportData {
  return {
    headers: ['Page', 'Views', 'Percentage'],
    rows: data.map((row) => [row.page, row.views, row.percentage]),
    filename: `top-pages-${websiteName}-${new Date().toISOString().split('T')[0]}`,
  }
}

