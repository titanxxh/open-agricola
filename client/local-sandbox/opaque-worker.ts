/**
 * Runs the local-sandbox engine Worker inside an opaque-origin sandboxed
 * iframe. The frame's CSP blocks network access, and the Worker cannot reach
 * the page's cookies, storage or DOM. This is the security boundary for
 * Workshop code (ADR 0052). Persistence stays on the page side, which
 * receives snapshots through `LocalGameTransport`.
 */
import type { LocalSandboxRequest, LocalSandboxResponse } from './protocol.ts'
import type { WorkerLike } from './local-transport.ts'

// The Vite plugin emits a self-contained classic Worker, including in dev.
const workerUrl = new URL('./worker.ts', import.meta.url).href
const FETCH_TIMEOUT_MS = 20_000
let bundle: Promise<string> | undefined
import.meta.hot?.on('local-sandbox-engine:invalidate', () => { bundle = undefined })

function loadBundle(): Promise<string> {
  bundle ??= fetch(workerUrl, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    .then(async response => {
      if (!response.ok) throw new Error('Local sandbox engine is unavailable')
      return response.text()
    })
    .catch(error => { bundle = undefined; throw error })
  return bundle
}

const frameDocument = (channel: string, nonce: string) => `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
</head><body><script nonce="${nonce}">
  const channel = ${JSON.stringify(channel)};
  let worker, url, ready = false, stopped = false;
  const send = message => parent.postMessage({ channel, ...message }, '*');
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== channel || stopped) return;
    const data = event.data;
    if (data.kind === 'stop') {
      stopped = true; worker?.terminate(); if (url) URL.revokeObjectURL(url); return;
    }
    if (data.kind === 'post') { if (ready) worker.postMessage(data.message); return; }
    if (data.kind !== 'start' || worker) return;
    try {
      url = URL.createObjectURL(new Blob([data.workerSource], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = event => {
        const message = event.data;
        if (!ready) {
          if (message?.kind !== 'ready') return;
          if (message.origin !== 'null') { send({ kind: 'error', error: 'Local sandbox Worker must have an opaque origin' }); return; }
          ready = true;
        }
        send({ kind: 'worker', message });
      };
      worker.onerror = event => send({ kind: 'error', error: event.message || 'Local sandbox Worker failed' });
    } catch (error) { send({ kind: 'error', error: String(error) }); }
  });
  send({ kind: 'frame-ready' });
</script></body></html>`

/** A `WorkerLike` whose Worker lives in a fresh opaque iframe. */
export function createOpaqueEngineWorker(): WorkerLike {
  const channel = crypto.randomUUID()
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.srcdoc = frameDocument(channel, nonce)
  const queued: LocalSandboxRequest[] = []
  let ready = false
  let terminated = false

  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      if (terminated) return
      if (!ready) { queued.push(message); return }
      frame.contentWindow?.postMessage({ channel, kind: 'post', message }, '*')
    },
    terminate() {
      if (terminated) return
      terminated = true
      window.removeEventListener('message', receive)
      frame.contentWindow?.postMessage({ channel, kind: 'stop' }, '*')
      frame.remove()
    },
  }
  const fail = (error: string) => {
    if (terminated) return
    worker.onerror?.({ message: error })
  }
  const receive = (event: MessageEvent<unknown>) => {
    if (terminated || event.source !== frame.contentWindow || event.origin !== 'null') return
    const data = event.data
    if (!data || typeof data !== 'object' || !('channel' in data) || data.channel !== channel || !('kind' in data)) return
    if (data.kind === 'frame-ready') {
      void loadBundle().then(workerSource => {
        if (!terminated) frame.contentWindow?.postMessage({ channel, kind: 'start', workerSource }, '*')
      }, (error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    } else if (data.kind === 'error') {
      fail('error' in data ? String(data.error) : 'Local sandbox Worker failed')
    } else if (data.kind === 'worker' && 'message' in data) {
      const message = data.message as LocalSandboxResponse
      if (!ready && message?.kind === 'ready') {
        ready = true
        for (const request of queued.splice(0)) frame.contentWindow?.postMessage({ channel, kind: 'post', message: request }, '*')
      }
      worker.onmessage?.({ data: message })
    }
  }
  window.addEventListener('message', receive)
  document.body.append(frame)
  return worker
}
