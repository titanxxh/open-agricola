import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth.ts'
import { fullSha } from './verification-tasks.ts'

const MAX_BODY_BYTES = 16 * 1024

function origin(value: string | undefined): string {
  if (!value) throw new Error('Pages readiness requires VITE_API_BASE and PUBLIC_APP_ORIGIN')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Pages readiness requires credential-free HTTPS origins')
  }
  return url.origin
}

async function json(response: Response): Promise<unknown> {
  if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) {
    throw new Error('Backend readiness requires a successful JSON response')
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BODY_BYTES) throw new Error('Backend readiness response exceeds its limit')
      chunks.push(value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new Error('Invalid backend readiness JSON') }
  } finally { await reader.cancel().catch(() => undefined) }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backend readiness response')
  return Object.fromEntries(Object.entries(value))
}

export async function assertPagesBackendReady({ candidateSha, apiBase, appOrigin, request = fetch }: {
  candidateSha: string; apiBase: string | undefined; appOrigin: string | undefined; request?: typeof fetch
}): Promise<void> {
  fullSha(candidateSha)
  const api = origin(apiBase), app = origin(appOrigin)
  const read = async (path: string): Promise<Record<string, unknown>> => {
    const response = await request(new URL(path, api), {
      method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json' },
    })
    return object(await json(response))
  }
  const [health, policy] = await Promise.all([read('/api/health'), read('/api/auth/browser-policy')])
  if (health.ok !== true || policy.version !== BROWSER_AUTH_VERSION || policy.buildId !== candidateSha
    || policy.appOrigin !== app || policy.apiOrigin !== api) {
    throw new Error(`Pages is waiting for healthy backend ${candidateSha} with matching browser origins`)
  }
}
