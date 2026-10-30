import type { WorkshopBrowserTestOutcome } from '../../shared/contract/workshop.ts'

// The Vite plugin emits a self-contained classic Worker, including in dev.
const workerUrl = new URL('./card-tests.worker.ts', import.meta.url).href
const TIMEOUT_MS = 20_000
let runtime: Promise<{ source: string; id: string }> | undefined
import.meta.hot?.on('browser-card-tests:invalidate', () => { runtime = undefined })

function loadRuntime() {
  runtime ??= fetch(workerUrl, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) }).then(async response => {
    if (!response.ok) throw new Error('Browser test runtime is unavailable')
    const bytes = await response.arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    const id = `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`
    return { source: new TextDecoder().decode(bytes), id }
  }).catch(error => { runtime = undefined; throw error })
  return runtime
}

export async function getBrowserTestRuntimeId(): Promise<string> {
  return (await loadRuntime()).id
}

function parseOutcome(value: unknown): WorkshopBrowserTestOutcome {
  if (!value || typeof value !== 'object' || !('kind' in value)) throw new Error('Invalid browser test result')
  if (value.kind === 'passed' && 'count' in value && typeof value.count === 'number'
    && Number.isSafeInteger(value.count) && value.count > 0) return { kind: 'passed', count: value.count }
  if (value.kind === 'error' && 'message' in value && typeof value.message === 'string') return { kind: 'error', message: value.message }
  if (value.kind === 'failed' && 'failures' in value && Array.isArray(value.failures) && value.failures.length) {
    const failures = value.failures.map((failure: unknown) => {
      if (!failure || typeof failure !== 'object' || !('name' in failure) || typeof failure.name !== 'string'
        || !('error' in failure) || typeof failure.error !== 'string') throw new Error('Invalid browser test failure')
      return { name: failure.name, error: failure.error }
    })
    return { kind: 'failed', failures }
  }
  throw new Error('Invalid browser test result')
}

/** Each run gets an opaque iframe and a fresh Worker. Cancellation kills the Worker. */
export async function runBrowserCardTests(input: {
  source: string; tests: string; signal: AbortSignal
}): Promise<{ browserRuntimeId: string; outcome: WorkshopBrowserTestOutcome }> {
  input.signal.throwIfAborted()
  const bundle = await new Promise<Awaited<ReturnType<typeof loadRuntime>>>((resolve, reject) => {
    const abort = () => { input.signal.removeEventListener('abort', abort); reject(input.signal.reason) }
    input.signal.addEventListener('abort', abort, { once: true })
    void loadRuntime().then(value => {
      input.signal.removeEventListener('abort', abort); resolve(value)
    }, error => {
      input.signal.removeEventListener('abort', abort); reject(error)
    })
  })
  input.signal.throwIfAborted()
  const channel = crypto.randomUUID()
  const id = crypto.randomUUID()
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.srcdoc = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
</head><body><script nonce="${nonce}">
  const channel = ${JSON.stringify(channel)};
  const id = ${JSON.stringify(id)};
  let worker, url, started = false, stopped = false;
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== channel || event.data?.id !== id) return;
    if (event.data.kind === 'stop') {
      stopped = true; worker?.terminate(); if (url) URL.revokeObjectURL(url);
      parent.postMessage({ channel, id, kind: 'stopped' }, '*'); return;
    }
    if (event.data.kind !== 'start' || worker || stopped) return;
    const input = event.data.input;
    try {
      url = URL.createObjectURL(new Blob([event.data.workerSource], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = event => {
        const data = event.data;
        if (data?.kind === 'ready') {
          if (started) return;
          started = true;
          if (data.origin !== 'null') {
            parent.postMessage({ channel, id, kind: 'error', error: 'Test Worker must have an opaque origin' }, '*'); return;
          }
          worker.postMessage(input); return;
        }
        if (started && data?.id === id) parent.postMessage({ channel, id, kind: 'worker', data }, '*');
      };
      worker.onerror = event => parent.postMessage({ channel, id, kind: 'error', error: event.message }, '*');
    } catch(error) { parent.postMessage({ channel, id, kind: 'error', error: String(error) }, '*'); }
  });
  parent.postMessage({ channel, id, kind: 'frame-ready' }, '*');
</script></body></html>`

  const outcome = await new Promise<WorkshopBrowserTestOutcome>(resolve => {
    let ending: WorkshopBrowserTestOutcome | undefined
    let removed = false
    let sent = false
    let stopTimer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (removed || !ending) return
      removed = true
      clearTimeout(stopTimer)
      window.removeEventListener('message', message)
      frame.remove()
      resolve(ending)
    }
    const finish = (result: WorkshopBrowserTestOutcome) => {
      if (ending) return
      ending = result
      clearTimeout(timer)
      input.signal.removeEventListener('abort', abort)
      if (frame.isConnected && frame.contentWindow) {
        stopTimer = setTimeout(() => { ending = { kind: 'error', message: 'Browser test Worker termination was not confirmed' }; cleanup() }, 1000)
        frame.contentWindow.postMessage({ channel, id, kind: 'stop' }, '*')
      } else cleanup()
    }
    const abort = () => finish({ kind: 'error', message: 'Browser tests cancelled' })
    const timer = setTimeout(() => finish({ kind: 'error', message: 'Browser tests timed out' }), TIMEOUT_MS)
    const message = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return
      const data = event.data
      if (!data || typeof data !== 'object' || !('channel' in data) || data.channel !== channel
        || !('id' in data) || data.id !== id || !('kind' in data)) return
      if (data.kind === 'stopped' && ending) { cleanup(); return }
      if (ending) return
      if (data.kind === 'frame-ready' && !sent) {
        sent = true
        frame.contentWindow?.postMessage({ channel, id, kind: 'start', workerSource: bundle.source,
          input: { kind: 'run', id, source: input.source, tests: input.tests } }, '*')
      } else if (data.kind === 'error') finish({ kind: 'error', message: 'error' in data ? String(data.error) : 'Browser Worker failed' })
      else if (data.kind === 'worker' && 'data' in data) {
        const result = data.data
        if (!result || typeof result !== 'object' || !('kind' in result) || result.kind !== 'result'
          || !('id' in result) || result.id !== id || !('outcome' in result)) return
        try { finish(parseOutcome(result.outcome)) }
        catch (error) { finish({ kind: 'error', message: error instanceof Error ? error.message : String(error) }) }
      }
    }
    window.addEventListener('message', message)
    input.signal.addEventListener('abort', abort, { once: true })
    if (input.signal.aborted) abort()
    else document.body.append(frame)
  })
  return { browserRuntimeId: bundle.id, outcome }
}
