import { expect, type APIResponse, type BrowserContext } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from '../fixtures'

const cookieValue = (response: APIResponse, name: string): string => {
  const header = response.headersArray().find(entry => entry.name.toLowerCase() === 'set-cookie' && entry.value.startsWith(`${name}=`))
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

export async function authenticateTeamAccount(context: BrowserContext, username: string, displayName: string) {
  const oauth = await context.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: { providerUserId: `team-${username}`, providerLogin: username, email: `${username}@example.com`, displayName },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await context.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: { username, displayName, password: 'team-pass-1603', confirmPassword: 'team-pass-1603' },
  })
  expect(complete.ok(), await complete.text()).toBe(true)
  await context.addCookies([{ name: 'oa_session', value: cookieValue(complete, 'oa_session'), url: FRONTEND_URL }])
}
