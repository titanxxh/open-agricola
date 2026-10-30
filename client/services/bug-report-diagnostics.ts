import {
  MAX_BUG_REPORT_DISCONNECTS,
  parseBugReportDiagnostics,
  type BugReportDiagnostics,
  type BugReportDisconnect,
} from '../../shared/contract/bug-report-diagnostics'

const STORAGE_KEY = 'open-agricola:bug-report-disconnects'
const HISTORY_TTL_MS = 60 * 60 * 1000
let lastHistory: { roomId: string; diagnostics: BugReportDiagnostics } | undefined

function browserEnvironment(): Pick<BugReportDiagnostics, 'deviceType' | 'browser'> {
  if (typeof navigator === 'undefined') return { deviceType: 'unknown', browser: { name: 'unknown', version: null } }
  const agent = navigator.userAgent
  const deviceType = /iPad|Tablet/i.test(agent) || /Macintosh/i.test(agent) && navigator.maxTouchPoints > 1
    || /Android/i.test(agent) && !/Mobile/i.test(agent)
    ? 'tablet'
    : /Mobile|iPhone|iPod/i.test(agent) ? 'mobile'
      : /Windows|Macintosh|Linux|CrOS/i.test(agent) ? 'desktop' : 'unknown'
  const patterns: Array<[BugReportDiagnostics['browser']['name'], RegExp]> = [
    ['WeChat', /MicroMessenger\/([\d.]+)/],
    ['Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]
  for (const [name, pattern] of patterns) {
    const version = pattern.exec(agent)?.[1]
    if (version) return { deviceType, browser: { name, version } }
  }
  return { deviceType, browser: { name: 'unknown', version: null } }
}

export function collectBugReportDiagnostics(roomId: string): BugReportDiagnostics {
  let history = lastHistory
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const saved: unknown = raw ? JSON.parse(raw) : null
    if (saved && typeof saved === 'object' && 'roomId' in saved && saved.roomId === roomId && 'diagnostics' in saved) {
      const diagnostics = parseBugReportDiagnostics(saved.diagnostics)
      if (diagnostics) history = { roomId, diagnostics }
    }
  } catch { /* Keep in-memory history when browser storage is unavailable. */ }
  const now = Date.now()
  const disconnects = history?.roomId === roomId
    ? history.diagnostics.disconnects.filter(event => event.occurredAt <= now && now - event.occurredAt < HISTORY_TTL_MS)
    : []
  return { ...browserEnvironment(), disconnects }
}

export function recordBugReportDisconnect(roomId: string, event: Pick<CloseEvent, 'code' | 'reason' | 'wasClean'>): void {
  if (!roomId) return
  const disconnect: BugReportDisconnect = { occurredAt: Date.now(), code: event.code, reason: event.reason, wasClean: event.wasClean }
  const current = collectBugReportDiagnostics(roomId)
  const diagnostics = parseBugReportDiagnostics({
    ...current,
    disconnects: [...current.disconnects, disconnect].slice(-MAX_BUG_REPORT_DISCONNECTS),
  })
  if (!diagnostics) return
  lastHistory = { roomId, diagnostics }
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lastHistory)) }
  catch { /* Recording diagnostics must not interrupt reconnect. */ }
}
