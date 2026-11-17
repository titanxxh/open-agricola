// Owner-only formal admin calls for acceptance accounts: Beta grant/revoke/list and full logout. Reports labels only.
import { readFileSync } from 'node:fs'

const protocolHeaders = origins => ({ Origin: origins.formalApp, 'x-oa-browser-protocol': '2', 'Content-Type': 'application/json' })

function ownerCookie(path) {
  const cookie = readFileSync(path, 'utf8').trim()
  if (!/^__Host-oa-session=[A-Za-z0-9._~-]+$/.test(cookie)) throw new Error('Invalid formal owner cookie file')
  return cookie
}

/** Grants (`grant`) or revokes (`revoke`) Beta for each labelled account, then reports every label's Beta state. */
export async function setBeta({ origins, ownerCookieFile, fetchImpl = fetch }, action, accounts, labels) {
  const headers = { ...protocolHeaders(origins), Cookie: ownerCookie(ownerCookieFile) }
  const call = (method, body) => fetchImpl(origins.formalApi + '/api/admin/beta-access', { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) })
  const changes = []
  for (const label of labels) {
    const account = accounts.find(entry => entry.label === label)
    if (!account) throw new Error(`Account ${label} is not configured`)
    const response = await call(action === 'grant' ? 'PUT' : 'DELETE', { userId: account.id })
    changes.push({ label, action, status: response.status })
    if (response.status !== 200) throw new Error(`Beta ${action} for ${label} failed (${response.status})`)
  }
  const listed = await call('GET'), text = await listed.text()
  if (listed.status !== 200) throw new Error(`Beta list failed (${listed.status})`)
  return { changes, beta: Object.fromEntries(accounts.map(account => [account.label, text.includes(`"${account.id}"`)])) }
}

/** Logs each account out of every formal session and proves its session is gone. */
export async function logoutAll({ origins, fetchImpl = fetch }, accounts) {
  const headers = protocolHeaders(origins), rows = []
  for (const account of accounts) {
    const login = await fetchImpl(origins.formalApi + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: account.username, password: account.password }), signal: AbortSignal.timeout(20_000) })
    const cookie = (login.headers.getSetCookie?.() ?? []).map(value => value.split(';')[0]).filter(value => value.startsWith('__Host-oa-session=')).join('; ')
    const out = cookie ? await fetchImpl(origins.formalApi + '/api/auth/logout-all', { method: 'POST', headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(20_000) }) : null
    const after = cookie ? await fetchImpl(origins.formalApi + '/api/auth/me', { headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(20_000) }) : null
    rows.push({ label: account.label, login: login.status, logoutAll: out?.status ?? null, meAfter: after?.status ?? null })
  }
  const failed = rows.filter(row => row.login !== 200 || row.logoutAll !== 200 || row.meAfter !== 401)
  if (failed.length) throw new Error(`Logout-all did not end every session: ${failed.map(row => row.label).join(', ')}`)
  return rows
}
