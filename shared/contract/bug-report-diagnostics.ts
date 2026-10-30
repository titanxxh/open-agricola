export const MAX_BUG_REPORT_DISCONNECTS = 5

export type BugReportDisconnect = {
  occurredAt: number
  code: number
  reason: string
  wasClean: boolean
}

export type BugReportDiagnostics = {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown'
  browser: {
    name: 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Opera' | 'Samsung Internet' | 'WeChat' | 'unknown'
    version: string | null
  }
  disconnects: BugReportDisconnect[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every(key => keys.includes(key))

export function parseBugReportDiagnostics(value: unknown): BugReportDiagnostics | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['deviceType', 'browser', 'disconnects'])) return null
  const { deviceType, browser, disconnects } = value
  if (deviceType !== 'mobile' && deviceType !== 'tablet' && deviceType !== 'desktop' && deviceType !== 'unknown') return null
  if (!isRecord(browser) || !hasOnlyKeys(browser, ['name', 'version'])) return null
  const { name, version } = browser
  if (name !== 'Chrome' && name !== 'Safari' && name !== 'Firefox' && name !== 'Edge'
    && name !== 'Opera' && name !== 'Samsung Internet' && name !== 'WeChat' && name !== 'unknown') return null
  if (version !== null && (typeof version !== 'string' || !/^\d{1,4}(?:\.\d{1,6}){0,3}$/.test(version))) return null
  if (!Array.isArray(disconnects) || disconnects.length > MAX_BUG_REPORT_DISCONNECTS) return null
  const parsed: BugReportDisconnect[] = []
  for (const disconnect of disconnects) {
    if (!isRecord(disconnect) || !hasOnlyKeys(disconnect, ['occurredAt', 'code', 'reason', 'wasClean'])) return null
    const { occurredAt, code, reason, wasClean } = disconnect
    if (typeof occurredAt !== 'number' || !Number.isSafeInteger(occurredAt) || occurredAt <= 0 || occurredAt >= 8_640_000_000_000_000) return null
    if (typeof code !== 'number' || !Number.isInteger(code) || code < 1000 || code > 4999) return null
    if (typeof reason !== 'string' || reason.length > 123 || typeof wasClean !== 'boolean') return null
    parsed.push({ occurredAt, code, reason: reason.replace(/[\p{Cc}\p{Cf}]/gu, '').replaceAll('<', '&lt;'), wasClean })
  }
  return { deviceType, browser: { name, version }, disconnects: parsed }
}
