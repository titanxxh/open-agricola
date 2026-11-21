/**
 * Formal-side files that define the identity boundary pre relies on: handoff issue/exchange, sessions and logout,
 * Beta eligibility, account deletion, the browser policy and the gateway's copy of it. Broad routers (server/index.ts,
 * ws-server, PageRouter) are left out on purpose: the fast path still runs handoff and boundary on every engine
 * against the live formal build, which exercises those routes. Git pathspecs, relative to the repository root.
 */
export const IDENTITY_BOUNDARY_PATHS = [
  'client/app/PrereleaseHandoffPage.tsx',
  'client/services/prerelease.ts',
  'server/auth.ts',
  'server/auth-cookies.ts',
  'server/request-auth.ts',
  'server/http-origin.ts',
  'server/oauth/handler.ts',
  ':(glob)server/beta-access-*.ts',
  ':(glob)server/prerelease-*.ts',
  'shared/contract/beta-access.ts',
  'shared/contract/browser-auth.ts',
  'shared/contract/prerelease-identity.ts',
  ':(glob)server/database/*beta-access*.sql',
  ':(glob)server/database/*prerelease*.sql',
  ':(glob)server/database/*browser-auth*.sql',
  'scripts/prerelease/browser-policy.ts',
]
