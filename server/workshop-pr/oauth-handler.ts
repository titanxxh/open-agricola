import type { IncomingMessage, ServerResponse } from 'node:http'
import { workshopPrConfig, workshopPrEnabled } from './config.ts'
import { tokenCache } from './token-cache.ts'

/**
 * GET /api/workshop/github/oauth/start?hs=<handshakeId>
 *
 * Validates the handshakeId (must be pending in tokenCache), then 302-redirects
 * the browser to GitHub's authorization URL. GitHub will redirect back to
 * /api/workshop/github/oauth/callback?code=...&state=<hs>.
 */
export function handleOAuthStart(req: IncomingMessage, res: ServerResponse, url: URL): void {
  if (!workshopPrEnabled()) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'workshop PR integration disabled' }))
    return
  }
  const hs = url.searchParams.get('hs')
  if (!hs || !tokenCache.hasPending(hs)) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'invalid or expired handshakeId' }))
    return
  }
  const baseUrl = deriveBaseUrl(req)
  const redirectUri = `${baseUrl}${workshopPrConfig.callbackPath}`
  const params = new URLSearchParams({
    client_id: workshopPrConfig.clientId,
    redirect_uri: redirectUri,
    scope: 'public_repo',
    state: hs,
    allow_signup: 'false',
  })
  res.writeHead(302, {
    Location: `https://github.com/login/oauth/authorize?${params.toString()}`,
  })
  res.end()
}

/**
 * GET /api/workshop/github/oauth/callback?code=...&state=<hs>
 *
 * Exchanges the OAuth code for an access token and binds it to the handshakeId
 * in tokenCache. Responds with a minimal HTML page that posts a message to the
 * opener window and closes itself.
 */
export async function handleOAuthCallback(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (!state || !tokenCache.hasPending(state)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('invalid state')
    return
  }

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(closePopupHtml({ ok: false, error, hs: state }))
    return
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('missing code')
    return
  }

  // Exchange code for access token
  let accessToken: string | null = null
  try {
    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: workshopPrConfig.clientId,
        client_secret: workshopPrConfig.clientSecret,
        code,
        state,
      }),
    })
    const data = (await resp.json()) as { access_token?: string; error?: string }
    if (data.access_token) accessToken = data.access_token
  } catch {
    // fall through — accessToken stays null
  }

  if (!accessToken) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(closePopupHtml({ ok: false, error: 'token_exchange_failed', hs: state }))
    return
  }

  tokenCache.bind(state, accessToken)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(closePopupHtml({ ok: true, hs: state }))
}

function deriveBaseUrl(req: IncomingMessage): string {
  if (process.env.PUBLIC_API_BASE) return process.env.PUBLIC_API_BASE
  const host = req.headers.host ?? 'localhost'
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'http'
  return `${proto}://${host}`
}

function closePopupHtml(result: { ok: boolean; hs: string; error?: string }): string {
  const safeResult = JSON.stringify(result).replace(/</g, '\\u003c')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Workshop OAuth</title></head>
<body>
<script>
(function() {
  var result = ${safeResult};
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'workshop-pr-oauth', result: result }, '*');
    }
  } catch (e) {}
  try { window.close(); } catch (e) {}
})();
</script>
<p>Authorization complete. You may close this window.</p>
</body></html>
`
}
