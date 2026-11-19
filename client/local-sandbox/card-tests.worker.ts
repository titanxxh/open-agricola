/// <reference lib="webworker" />
/** The embedding opaque iframe and CSP isolate test code from page credentials. */
import { ensureRandomUUID } from './worker-crypto.ts'
import { runBrowserCardTestScript, type BrowserCardTestRequest, type BrowserCardTestResult } from './card-test-runtime.ts'

declare const self: DedicatedWorkerGlobalScope
const send = self.postMessage.bind(self)
for (const key of ['Worker', 'SharedWorker']) {
  Object.defineProperty(self, key, { value: undefined, writable: false, configurable: false })
}

ensureRandomUUID()

function parseRequest(value: unknown): BrowserCardTestRequest {
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'run'
    || !('id' in value) || typeof value.id !== 'string'
    || !('source' in value) || typeof value.source !== 'string'
    || !('tests' in value) || typeof value.tests !== 'string') throw new Error('Invalid browser card test request')
  return { kind: 'run', id: value.id, source: value.source, tests: value.tests }
}

let started = false
self.onmessage = async (event: MessageEvent<unknown>) => {
  if (started) return
  started = true
  let id = 'invalid-request'
  try {
    const request = parseRequest(event.data)
    id = request.id
    send(await runBrowserCardTestScript(request, name => send({ kind: 'test-start', id: request.id, name })))
  }
  catch (error) {
    const failure: BrowserCardTestResult = { kind: 'result', id, outcome: { kind: 'error', message: error instanceof Error ? error.message : String(error) } }
    send(failure)
  }
}

send({ kind: 'ready', origin: self.origin })
