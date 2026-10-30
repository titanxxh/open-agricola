import { createHash } from 'node:crypto'
import { test, expect, chromium, webkit, type Page } from '@playwright/test'
import { source, passingTests, choiceSource, choiceTests, handshakeTests, infiniteTests, isolationTests } from './fixtures/browser-card-tests.ts'

async function run(page: Page, source: string, tests: string) {
  return page.evaluate(async ({ source, tests }) => {
    const modulePath = '/client/local-sandbox/card-tests.ts'
    const api: typeof import('../client/local-sandbox/card-tests.ts') = await import(modulePath)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    const observe = (event: MessageEvent) => {
      if (event.data?.kind === 'stopped' && event.source === document.querySelector('iframe')?.contentWindow) {
        document.body.dataset.terminated = 'true'
      }
      if (event.data?.kind !== 'worker' || event.data.data?.kind !== 'test-start') return
      document.body.dataset.testName = event.data.data.name
      document.body.dataset.identity = JSON.stringify({ channel: event.data.channel, id: event.data.id })
    }
    document.body.dataset.runState = 'running'
    delete document.body.dataset.testName
    delete document.body.dataset.terminated
    addEventListener('message', observe)
    addEventListener('cancel-browser-tests', cancel)
    try { return await api.runBrowserCardTests({ source, tests, signal: controller.signal }) }
    finally {
      document.body.dataset.runState = 'finished'
      removeEventListener('message', observe)
      removeEventListener('cancel-browser-tests', cancel)
    }
  }, { source, tests })
}

for (const engine of ['chromium', 'webkit'] as const) {
  test(`${engine}: browser card tests isolate code and terminate runaway Workers`, async ({ baseURL }, testInfo) => {
    test.setTimeout(180_000)
    const browser = await (engine === 'chromium' ? chromium : webkit).launch()
    try {
      const context = await browser.newContext({ baseURL })
      const page = await context.newPage()
      const requests: string[] = []
      context.on('request', request => {
        if (request.url().includes('__browser_card_test_exfil__')) requests.push(request.url())
      })
      await context.route('**/__browser_card_test_exfil__*', route => route.fulfill({
        contentType: 'text/javascript', body: '/* controlled network probe */',
      }))
      await page.goto('/e2e-tests/fixtures/browser-card-tests.html')
      const exfilUrl = new URL('/__browser_card_test_exfil__', page.url()).href
      await page.evaluate(async url => {
        localStorage.setItem('browser-card-test-secret', 'parent-only-marker')
        document.cookie = 'browser_card_test_secret=parent-only-marker; SameSite=Lax'
        const blob = URL.createObjectURL(new Blob([
          `onmessage = async event => { await fetch(event.data, {credentials:'include'}); postMessage('done') }`,
        ], { type: 'text/javascript' }))
        const worker = new Worker(blob)
        try {
          await new Promise<void>((resolve, reject) => {
            worker.onmessage = () => resolve()
            worker.onerror = event => reject(new Error(event.message))
            worker.postMessage(url)
          })
        } finally { worker.terminate(); URL.revokeObjectURL(blob) }
      }, `${exfilUrl}?control`)
      expect(requests).toHaveLength(1)
      requests.length = 0

      const workerResponse = page.waitForResponse(response => response.url().includes('@browser-card-tests-worker.js'))
      const runtimeId = await page.evaluate(async () => {
        const modulePath = '/client/local-sandbox/card-tests.ts'
        const api: typeof import('../client/local-sandbox/card-tests.ts') = await import(modulePath)
        return api.getBrowserTestRuntimeId()
      })
      expect(runtimeId).toBe(`sha256:${createHash('sha256').update(await (await workerResponse).body()).digest('hex')}`)
      const records = []
      for (const [name, cardSource, tests, expected] of [
        ['real effects and fresh Session', source, passingTests, 'passed'],
        ['wrong implementation', source.replace('wood: 1', 'wood: 2'), passingTests, 'failed'],
        ['real pending choice', choiceSource, choiceTests, 'passed'],
        ['opaque origin and CSP', source, isolationTests(exfilUrl), 'passed'],
        ['forged repeated ready', source, handshakeTests, 'failed'],
        ['invalid source', source + '\nconst broken = ;', passingTests, 'error'],
        ['empty suite', source, '', 'error'],
        ['invalid test syntax', source, 'test(', 'error'],
        ['imports rejected', source, "import 'https://example.invalid/code.js'", 'error'],
        ['async assertions', source, "test('async',async()=>{await Promise.resolve();expect(2+2).to.equal(4)})", 'passed'],
      ] as const) {
        const result = await run(page, cardSource, tests)
        records.push({ name, result })
        expect(result.browserRuntimeId).toBe(runtimeId)
        expect(result.outcome.kind, JSON.stringify({ name, result })).toBe(expected)
        if (name === 'wrong implementation' || name === 'forged repeated ready') {
          expect(JSON.stringify(result.outcome)).toContain('expected 5 to equal 4')
        }
        if (name === 'empty suite') expect(result.outcome).toEqual({ kind: 'error', message: 'No tests were registered' })
        await expect(page.locator('iframe')).toHaveCount(0)
        await expect(page.locator('body')).toHaveAttribute('data-terminated', 'true')
      }
      expect(requests).toHaveLength(0)

      const cancelRun = run(page, source, infiniteTests)
      await expect(page.locator('body')).toHaveAttribute('data-test-name', 'Runaway test')
      await page.evaluate(async () => {
        const identity = JSON.parse(document.body.dataset.identity ?? 'null')
        if (!identity) throw new Error('No running test identity')
        const peer = document.createElement('iframe')
        peer.setAttribute('sandbox', 'allow-scripts')
        await new Promise<void>(resolve => {
          const received = (event: MessageEvent) => {
            if (event.source !== peer.contentWindow || event.data?.kind !== 'spoof-sent') return
            removeEventListener('message', received); peer.remove(); resolve()
          }
          addEventListener('message', received)
          peer.srcdoc = '<script>parent.postMessage(' + JSON.stringify({ ...identity, kind: 'worker',
            data: { kind: 'result', id: identity.id, outcome: { kind: 'passed', count: 1 } } })
            + ',"*");parent.postMessage({kind:"spoof-sent"},"*")</script>'
          document.body.append(peer)
        })
      })
      await expect(page.locator('body')).toHaveAttribute('data-run-state', 'running')
      await page.evaluate(() => dispatchEvent(new Event('cancel-browser-tests')))
      expect(await cancelRun).toEqual({ browserRuntimeId: runtimeId, outcome: { kind: 'error', message: 'Browser tests cancelled' } })
      await expect(page.locator('body')).toHaveAttribute('data-terminated', 'true')
      await expect(page.locator('iframe')).toHaveCount(0)

      const timeoutRun = run(page, source, infiniteTests)
      await expect(page.locator('body')).toHaveAttribute('data-test-name', 'Runaway test')
      expect(await timeoutRun).toEqual({ browserRuntimeId: runtimeId, outcome: { kind: 'error', message: 'Browser tests timed out' } })
      await expect(page.locator('body')).toHaveAttribute('data-terminated', 'true')
      expect((await run(page, source, passingTests)).outcome.kind).toBe('passed')
      await expect(page.locator('iframe')).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem('browser-card-test-secret'))).toBe('parent-only-marker')
      expect(requests).toHaveLength(0)
      await testInfo.attach('browser-card-test-results.json', { contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ engine, runtimeId, records, requests }, null, 2)) })
    } finally { await browser.close() }
  })
}
