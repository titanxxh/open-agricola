import { expect, type BrowserContext } from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseEnv } from 'node:util'
import { startHostedReleaseApp, type HostedReleaseApp } from './hosted-release-app'

const exec = promisify(execFile)
export type BetaAccessApp = HostedReleaseApp & {
  environment: NodeJS.ProcessEnv
  authenticate(context: BrowserContext, username: string, displayName: string): Promise<void>
}

/** Isolates account qualification and browser state from other specs. */
export async function startHostedReleaseAppWithBetaAccess(): Promise<BetaAccessApp> {
  const root = await mkdtemp(join(tmpdir(), 'agricola-beta-'))
  const createEnvironment = { ...process.env }
  for (const key of ['BACKEND_PORT', 'FRONTEND_PORT', 'APP_BASE_PORT']) delete createEnvironment[key]
  await exec(process.execPath, ['--import', 'tsx', 'scripts/test-environment.ts', 'create', root], { env: createEnvironment })
  const envPath = join(root, 'test.env')
  await appendFile(envPath, "LOCAL_DEPENDENCIES_READY='1'\n")
  const environment = { ...process.env, ...parseEnv(await readFile(envPath, 'utf8')) }
  let hosted: HostedReleaseApp | undefined
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    await hosted?.close()
    await exec('bash', ['./restart-local.sh', '--kill-only'], { env: environment, maxBuffer: 8 * 1024 * 1024 })
    await exec(process.execPath, ['--import', 'tsx', 'scripts/test-environment.ts', 'cleanup', root], { env: environment })
    await rm(root, { recursive: true, force: true })
  })()
  try {
    await exec('bash', ['./restart-local.sh'], { env: environment, maxBuffer: 8 * 1024 * 1024 })
    hosted = await startHostedReleaseApp({ backendUrl: environment.BACKEND_URL!, frontendOrigin: environment.FRONTEND_URL! })
    const app = hosted
    return { ...app, environment, close, async authenticate(context, username, displayName) {
      await context.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'en') })
      const oauth = await context.request.post(`${app.apiUrl}/api/test/oauth/github/callback`, {
        data: { providerUserId: `beta-${username}`, providerLogin: username, email: `${username}@example.com`, displayName },
      })
      expect(oauth.ok(), await oauth.text()).toBe(true)
      const complete = await context.request.post(`${app.apiUrl}/api/auth/onboarding/complete`, {
        data: { username, displayName, password: 'beta-test-password', confirmPassword: 'beta-test-password' },
      })
      expect(complete.ok(), await complete.text()).toBe(true)
    } }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
