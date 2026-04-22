import { test } from '@playwright/test'

/**
 * TODO (C-27): implement the workshop -> GitHub PR browser flow as an E2E test.
 *
 * Deferred because a non-trivial amount of plumbing is required first:
 *   - backend needs a WORKSHOP_PR_MOCK_MODE env switch so GitHubClient
 *     short-circuits without real OAuth / REST calls
 *   - the OAuth popup has to be driven (or bypassed) from Playwright
 *   - a deterministic PR URL must be returned so the UI can assert on it
 *
 * Session tests in `server/__tests__/workshop-pr-session.test.ts` already cover
 * the back-end behaviour end-to-end (propose handler + github client + code-gen
 * + DB writes + audit log), so we do not block shipping on this E2E.
 */
test.skip('workshop PR propose flow — TODO: implement with WORKSHOP_PR_MOCK_MODE', async () => {
  // placeholder — see comment above
})
