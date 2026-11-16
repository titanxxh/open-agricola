import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { targetFingerprint, type PrereleaseTarget } from './config'
import { command } from './docker'
import { controlDirectory, type RuntimeRecord } from './runtime'

/** Verified import caches are `image-<purpose>-<source SHA>-<policy SHA>.json`; import journals and archives are not caches. */
const cacheName = /^image-(candidate|trusted-policy)-([a-f0-9]{40})-([a-f0-9]{40})\.json$/
const nativeId = (value: unknown): string | null => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value) ? value : null

export type ImageCleanupEntry = { file: string; purpose: string; sourceSha: string; producerSha: string; nativeImageId: string; reasons: string[] }
export type ImageCleanupPlan = { policySha: string; keep: ImageCleanupEntry[]; remove: ImageCleanupEntry[]; foreign: string[] }

/** Only Docker's own "no such image" answer proves absence; any other failure leaves the state unknown. */
function imageState(imageId: string): 'present' | 'missing' {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'LANG', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) if (process.env[key]) env[key] = process.env[key]
  const result = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', imageId], { env, encoding: 'utf8', timeout: 30_000 })
  if (result.status === 0 && result.stdout.trim() === imageId) return 'present'
  if (result.status !== 0 && /no such (?:image|object)/i.test(result.stderr ?? '')) return 'missing'
  throw new Error('Docker could not confirm whether the image is present; its import record is kept')
}
const failureText = (failure: unknown) => String(failure instanceof Error ? failure.message : failure).slice(0, 300)

/**
 * Plans removal of images imported for this target that nothing can still use. It keeps the current policy's tooling,
 * the installed candidate, every image of a pending operation and every image referenced by any container, including
 * stopped ones. Records of another target or without a native ID are reported and never touched.
 */
export function planImageCleanup(target: PrereleaseTarget, record: RuntimeRecord): ImageCleanupPlan {
  const control = controlDirectory(target), fingerprint = targetFingerprint(target)
  const policySha = command('git', ['rev-parse', 'HEAD'], { cwd: target.policyDirectory })
  const containers = command('docker', ['ps', '-a', '-q', '--no-trunc']).split(/\s+/).filter(Boolean)
  const used = new Set(containers.length ? command('docker', ['inspect', '--format', '{{.Image}}', ...containers]).split(/\s+/).filter(Boolean) : [])
  const pinned = new Set([record.installed?.image, record.operation?.image, record.operation?.sourceImage].filter((value): value is string => typeof value === 'string'))
  const plan: ImageCleanupPlan = { policySha, keep: [], remove: [], foreign: [] }
  for (const file of readdirSync(control).sort()) {
    const match = cacheName.exec(file)
    if (!match) continue
    let cached: { fingerprint?: unknown; nativeImageId?: unknown } | null = null
    try { cached = JSON.parse(readFileSync(join(control, file), 'utf8')) } catch { /* reported as foreign below */ }
    const nativeImageId = nativeId(cached?.nativeImageId)
    if (!nativeImageId || cached?.fingerprint !== fingerprint) { plan.foreign.push(file); continue }
    const [, purpose = '', sourceSha = '', producerSha = ''] = match
    const reasons: string[] = []
    if (purpose === 'candidate' && sourceSha === record.installed?.buildId && producerSha === policySha) reasons.push('installed-candidate')
    if (purpose === 'trusted-policy' && sourceSha === policySha && producerSha === policySha) reasons.push('current-policy')
    if (pinned.has(nativeImageId)) reasons.push('runtime-record')
    if (used.has(nativeImageId)) reasons.push('container')
    ;(reasons.length ? plan.keep : plan.remove).push({ file, purpose, sourceSha, producerSha, nativeImageId, reasons })
  }
  // Two records can bind one native image; an image is removable only when every record allows it.
  const kept = new Set(plan.keep.map(entry => entry.nativeImageId))
  plan.remove = plan.remove.filter(entry => {
    if (!kept.has(entry.nativeImageId)) return true
    plan.keep.push({ ...entry, reasons: ['shared-image'] })
    return false
  })
  return plan
}

/** Replans under the operation lock, removes images without force and retires only the records whose image is gone. */
export function executeImageCleanup(target: PrereleaseTarget, record: RuntimeRecord) {
  const control = controlDirectory(target)
  if (record.operation) throw new Error('Finish the pending prerelease operation before removing images')
  if (readdirSync(control).some(file => /^image-(import|snapshot)-.+\.tar$/.test(file))) throw new Error('An image import is in progress; finish or retry it before removing images')
  const plan = planImageCleanup(target, record)
  const retired = join(control, 'retired-images')
  mkdirSync(retired, { recursive: true, mode: 0o700 })
  const removed: ImageCleanupEntry[] = [], retained: Array<ImageCleanupEntry & { error: string }> = []
  for (const entry of plan.remove) {
    let error = ''
    try {
      if (imageState(entry.nativeImageId) === 'present') {
        try { command('docker', ['image', 'rm', entry.nativeImageId]) } catch (failure) { error = failureText(failure) }
      }
      if (imageState(entry.nativeImageId) === 'present') { retained.push({ ...entry, error: error || 'Docker retained the image' }); continue }
    } catch (failure) { retained.push({ ...entry, error: failureText(failure) }); continue }
    renameSync(join(control, entry.file), join(retired, entry.file))
    removed.push(entry)
  }
  return { mode: 'execute', policySha: plan.policySha, keep: plan.keep, removed, retained, foreign: plan.foreign }
}
