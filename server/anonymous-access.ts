/**
 * Whether session-less callers may use the development surfaces: anonymous
 * WebSocket rooms and the HTTP debug sandbox under `/api/game/*`.
 *
 * `ALLOW_ANONYMOUS_WS` decides explicitly when set; otherwise anonymous access
 * is allowed everywhere except production.
 */
export function allowAnonymousAccess(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_ANONYMOUS_WS !== undefined) return env.ALLOW_ANONYMOUS_WS === 'true'
  return env.NODE_ENV !== 'production'
}
