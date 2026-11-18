// Lane planning for `pnpm verify:parallel` (#1779): how many lanes, which spec files each lane runs, and whether a
// checkout may reuse a hosted frontend already built from the same sources instead of rebuilding it.
//   pnpm exec tsx scripts/verify-lanes.ts hosted-frontend   (the hosted-frontend step while VERIFY_HOSTED_FRONTEND_SOURCE is set)
//   pnpm exec tsx scripts/verify-lanes.ts write-marker      (after building once: a verify:parallel root or a caller's checkout)
// Only node built-ins and verification-tasks.ts are imported statically, so verify-parallel.mjs can load this module
// under plain Node; the source fingerprint comes from verify.ts, loaded only on the tsx command paths.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserSpecWeights, weightedAssignment } from './ci/verification-tasks.ts'

export const MAX_LANES = 8
export const HOSTED_FRONTEND_SOURCE = 'VERIFY_HOSTED_FRONTEND_SOURCE'
const MARKER = 'output/verification/hosted-frontend-build.json'
const SPEC = /\.(?:spec|test)\.[cm]?[jt]sx?$/
// Playwright and verify options that consume the following argument.
const VALUE_OPTIONS = new Set(['--grep', '-g', '--grep-invert', '--project', '--reporter', '--config', '-c', '--timeout', '--retries',
  '--workers', '-j', '--shard', '--output', '--repeat-each', '--max-failures', '--global-timeout', '--tsconfig', '--requirements'])

/** Explicit `--shards` wins; otherwise VERIFY_PARALLEL_LANES; otherwise one lane (an in-place `pnpm verify`). */
export function laneCount(explicit: number | undefined, env: NodeJS.ProcessEnv = process.env): number {
  const value = explicit ?? (env.VERIFY_PARALLEL_LANES ? Number(env.VERIFY_PARALLEL_LANES) : 1)
  if (!Number.isInteger(value) || value < 1 || value > MAX_LANES) throw new Error(`Lanes must be an integer from 1 to ${MAX_LANES}`)
  return value
}

/**
 * Separates exact spec file arguments from the other arguments. Returns `files: null` when any positional argument is
 * not an existing spec file (a pattern or `file:line`), in which case lanes keep Playwright's own `--shard` split.
 */
export function splitFileArgs(args: readonly string[], root: string): { files: string[] | null; options: string[] } {
  const files: string[] = [], options: string[] = []
  let exact = true
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (index === 0 && argument === 'e2e') { options.push(argument); continue }
    if (argument.startsWith('-')) {
      options.push(argument)
      if (!argument.includes('=') && VALUE_OPTIONS.has(argument) && index + 1 < args.length) options.push(args[++index])
      continue
    }
    if (SPEC.test(argument) && existsSync(join(root, argument)) && lstatSync(join(root, argument)).isFile()) files.push(argument)
    else exact = false
  }
  return { files: exact ? files : null, options }
}

/** Each lane's arguments: weighted file groups when the selection is exact files, else Playwright shards. */
export function laneArguments(args: readonly string[], selectedFiles: readonly string[], lanes: number, root: string, weights = browserSpecWeights()): string[][] {
  const split = splitFileArgs(args, root)
  if (!split.files) return Array.from({ length: lanes }, (_, index) => [...args, `--shard=${index + 1}/${lanes}`])
  return weightedAssignment(selectedFiles, lanes, weights).filter(group => group.length).map(group => [...split.options, ...group])
}

// E2E_* variables that steer only test selection or service setup, never the frontend bundle.
const NON_BUILD_E2E = new Set(['E2E_DEPENDENCIES_READY', 'E2E_EXTENDED'])

/** Build inputs beyond the source fingerprint that change the hosted frontend. */
export function hostedFrontendEnvironment(env: NodeJS.ProcessEnv): Record<string, string | null> {
  const keys = Object.keys(env).filter(key => /^(?:VITE_|PUBLIC_ASSET_|E2E_)/.test(key) && !NON_BUILD_E2E.has(key))
  for (const key of ['GAME_BUILD_ID', 'RELEASE_CHANNEL', 'NODE_ENV', 'NODE_OPTIONS', 'CI']) keys.push(key)
  return Object.fromEntries([...new Set(keys)].sort().map(key => [key, env[key] ?? null]))
}

// Vite reads these from the project root for the production build; they are ignored by Git, so the source fingerprint
// misses them and fresh lane worktrees never contain them.
export const VITE_DOTENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'] as const

/** SHA-256 of each dotenv file Vite would load for a production build, null when absent. */
export function viteDotenv(root: string): Record<string, string | null> {
  return Object.fromEntries(VITE_DOTENV_FILES.map(file => {
    const path = join(root, file)
    return [file, existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null]
  }))
}

type Marker = { schemaVersion: 1; head: string; fingerprint: string; environment: Record<string, string | null>; dotenv: Record<string, string | null> }

export function writeHostedFrontendMarker(root: string, head: string, fingerprint: string, env: NodeJS.ProcessEnv = process.env): string {
  const marker: Marker = { schemaVersion: 1, head, fingerprint, environment: hostedFrontendEnvironment(env), dotenv: viteDotenv(root) }
  const path = join(root, MARKER)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(marker, null, 2) + '\n')
  return path
}

/** Why a lane must build its own frontend, or null when the parent's build matches it exactly. */
export function hostedFrontendMismatch(source: string, head: string, fingerprint: string, env: NodeJS.ProcessEnv = process.env, dotenv: Record<string, string | null> = viteDotenv(source)): string | null {
  const path = join(source, MARKER)
  if (!existsSync(path) || !existsSync(join(source, 'dist', 'frontend-build.json'))) return 'no parent build'
  let marker: Partial<Marker>
  try { marker = JSON.parse(readFileSync(path, 'utf8')) as Partial<Marker> } catch { return 'unreadable parent build marker' }
  if (marker.schemaVersion !== 1 || marker.head !== head) return 'parent build is for another commit'
  if (marker.fingerprint !== fingerprint) return 'parent build sources differ'
  if (JSON.stringify(marker.environment) !== JSON.stringify(hostedFrontendEnvironment(env))) return 'parent build environment differs'
  if (JSON.stringify(marker.dotenv) !== JSON.stringify(dotenv)) return 'parent build dotenv files differ'
  return null
}

function run(command: string, args: string[], cwd: string): number {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

const headOf = (cwd: string) => spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim()
const fingerprintOf = async (cwd: string): Promise<string> => (await import('./verify.ts')).sourceFingerprint(cwd)

/** The `pnpm` arguments of a hosted-frontend step: the reuse check while a source build is named, else a plain build. */
export function hostedFrontendCommand(env: NodeJS.ProcessEnv = process.env): string[] {
  return env[HOSTED_FRONTEND_SOURCE] ? ['exec', 'tsx', 'scripts/verify-lanes.ts', 'hosted-frontend'] : ['run', 'build:hosted-frontend']
}

export type HostedFrontendTools = { run: typeof run; head: typeof headOf; fingerprint: typeof fingerprintOf }

/**
 * The hosted-frontend step while VERIFY_HOSTED_FRONTEND_SOURCE names a build (a verify:parallel root, or one the
 * caller prepared): copy it when it matches this checkout exactly, else build as usual. A source whose `dist` is this
 * checkout's own is already in place and is never removed.
 */
export async function hostedFrontendStep(cwd: string, env: NodeJS.ProcessEnv = process.env, tools: HostedFrontendTools = { run, head: headOf, fingerprint: fingerprintOf }): Promise<number> {
  const source = env[HOSTED_FRONTEND_SOURCE] ? resolve(env[HOSTED_FRONTEND_SOURCE]) : null
  const mismatch = source ? hostedFrontendMismatch(source, tools.head(cwd), await tools.fingerprint(cwd), env, viteDotenv(cwd)) : 'no parent build'
  if (!source || mismatch) {
    console.log(`[verify] building the hosted frontend (${mismatch})`)
    return tools.run('pnpm', ['run', 'build:hosted-frontend'], cwd)
  }
  // Generated card, language and encyclopedia files serve the dev server; the production bundle is copied.
  const prepared = tools.run('pnpm', ['run', 'build:cards-manifest'], cwd)
  if (prepared !== 0) return prepared
  const target = join(cwd, 'dist')
  if (existsSync(target) && realpathSync(target) === realpathSync(join(source, 'dist'))) {
    console.log(`[verify] reused the hosted frontend already built in ${source} for the same sources`)
    return 0
  }
  rmSync(target, { recursive: true, force: true })
  cpSync(join(source, 'dist'), target, { recursive: true })
  console.log(`[verify] reused the hosted frontend built by ${source} for the same sources`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  if (process.argv[2] === 'hosted-frontend') process.exitCode = await hostedFrontendStep(root)
  else if (process.argv[2] === 'write-marker') console.log(writeHostedFrontendMarker(root, headOf(root), await fingerprintOf(root)))
  else throw new Error('Usage: verify-lanes.ts hosted-frontend|write-marker')
}
