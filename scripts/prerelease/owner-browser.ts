import { chromium, type BrowserContext } from 'playwright'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertOwnerPath, parsePrereleaseTarget } from './config'
import { ownerMachine } from '../release/candidate'

/** This grants only private ingress. The candidate still applies real identity/Beta admission. */
export async function configureOwnerVerification(context: BrowserContext, origin: string, tokenFile: string): Promise<void> {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://') || statSync(tokenFile).mode & 0o077) throw new Error('Private HTTPS owner verification configuration required')
  const token = readFileSync(tokenFile, 'utf8').trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid private owner ingress token')
  const response = await context.request.post(`${origin}/__prerelease_verify`, { headers: { Origin: origin }, data: { token }, timeout: 15000 })
  if (response.status() !== 204) throw new Error('Private owner verification ingress was rejected')
}

export async function ownerBrowser(args: string[]): Promise<void> {
  ownerMachine()
  if (args.length !== 3) throw new Error('Usage: owner-browser.ts <target.json> <private-token-file> <private-owner-browser-profile>')
  const value: unknown = JSON.parse(readFileSync(args[0], 'utf8'))
  const target = parsePrereleaseTarget(value), profile = resolve(args[2])
  if (profile === target.directory || profile.startsWith(`${target.directory}${sep}`)) throw new Error('Owner browser profile must stay outside all candidate mounts')
  assertOwnerPath(profile)
  mkdirSync(profile, { recursive: true, mode: 0o700 })
  if (statSync(profile).mode & 0o077) throw new Error('Owner browser profile must be owner-private')
  const context = await chromium.launchPersistentContext(profile, { headless: false })
  try {
    await configureOwnerVerification(context, target.origin, args[1])
    const page = context.pages()[0] ?? await context.newPage()
    await page.goto(target.formal.appOrigin)
    const stop = () => { void context.close() }
    process.once('SIGINT', stop); process.once('SIGTERM', stop)
    console.log('Private owner browser ready. Sign in at the formal site and follow the normal prerelease entry. Public ingress stays in maintenance.')
    await new Promise<void>(done => context.once('close', () => done()))
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
  } finally { await context.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await ownerBrowser(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Owner browser failed'); process.exitCode = 1 }
}
