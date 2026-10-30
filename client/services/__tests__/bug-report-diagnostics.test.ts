// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectBugReportDiagnostics, recordBugReportDisconnect } from '../bug-report-diagnostics'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('bug report diagnostics', () => {
  it.each([
    [iphone, 1, 'mobile', 'Safari', '17.4'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17.4 Safari/605.1.15', 5, 'tablet', 'Safari', '17.4'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/123.0.6312.80 Mobile Safari/537.36', 1, 'mobile', 'Chrome', '123.0.6312.80'],
    ['Mozilla/5.0 (Windows NT 10.0) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.2420.65', 0, 'desktop', 'Edge', '123.0.2420.65'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/123.0.0.0 Safari/537.36', 1, 'tablet', 'Chrome', '123.0.0.0'],
    ['unknown browser', 0, 'unknown', 'unknown', null],
  ])('identifies %s without sending its raw user agent', (userAgent, maxTouchPoints, deviceType, name, version) => {
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints })
    expect(collectBugReportDiagnostics('new-room')).toEqual({ deviceType, browser: { name, version }, disconnects: [] })
  })

  it('keeps the last five closes for the target room across module reloads and expires them after an hour', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    for (let i = 0; i < 7; i++) {
      recordBugReportDisconnect('history-room', { code: 1006 + i, reason: `close ${i}`, wasClean: false })
    }
    vi.resetModules()
    const reloaded = await import('../bug-report-diagnostics')
    expect(reloaded.collectBugReportDiagnostics('history-room').disconnects.map(event => event.reason))
      .toEqual(['close 2', 'close 3', 'close 4', 'close 5', 'close 6'])
    expect(reloaded.collectBugReportDiagnostics('other-room').disconnects).toEqual([])
    vi.spyOn(Date, 'now').mockReturnValue(1_700_003_600_000)
    expect(reloaded.collectBugReportDiagnostics('history-room').disconnects).toEqual([])
  })

  it('retains a maximum-length close reason containing an angle bracket after reload', async () => {
    const reason = '<' + 'x'.repeat(122)
    recordBugReportDisconnect('angle-bracket-room', { code: 1012, reason, wasClean: true })
    vi.resetModules()
    const reloaded = await import('../bug-report-diagnostics')
    expect(reloaded.collectBugReportDiagnostics('angle-bracket-room').disconnects).toEqual([
      { occurredAt: expect.any(Number), code: 1012, reason, wasClean: true },
    ])
  })

  it('still collects a close when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    recordBugReportDisconnect('storage-blocked', { code: 1012, reason: 'service restart', wasClean: true })
    expect(collectBugReportDiagnostics('storage-blocked').disconnects).toEqual([
      { occurredAt: expect.any(Number), code: 1012, reason: 'service restart', wasClean: true },
    ])
  })
})
