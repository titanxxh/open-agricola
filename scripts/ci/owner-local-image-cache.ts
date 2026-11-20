// Owner-private image cache for owner-local verification (#1937). Every run gets a fresh rootless Docker, so without
// it each run downloads the same service and fixture images again. The trusted Docker CLI saves each image once,
// right after a registry pull into the fresh daemon and before any candidate code runs; the archive streams through
// the recorder into an owner-private directory the candidate cannot reach. Later runs stream it back into
// `docker load`, name it again (an archive saved by digest carries no name) and use it only when the daemon then
// resolves the reference to the expected digest; a missing, unreadable or mismatched archive falls back to the
// retried registry pull. Docker's containerd image store keeps registry digests through save and load.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const imageCacheDirectory = (home = process.env.HOME ?? '') => join(home, '.local/state/open-agricola/owner-local-verification/images')

/** One preparation command as the candidate; `stdin` / `stdout` stream from or to an owner file instead of the log. */
export type ImageStep = (phase: string, args: string[], io?: { stdin?: string; stdout?: string }) => Promise<number>
export type ImageSource = { image: string; digest: string | null; source: 'cache' | 'registry' }
export type ImageCacheContext = {
  directory: string
  /** Runs `docker <args>` and records the phase; exit code returned. */
  docker: ImageStep
  /** The output a finished phase logged, without the time stamps. */
  output: (phase: string) => string
  attempts: number
  retry: () => Promise<void>
}

const REFERENCE = /^((?:[a-z0-9.-]+(?::\d+)?\/)?[a-z0-9]+(?:[._/-][a-z0-9]+)*)(?::([\w][\w.-]{0,127}))?(?:@(sha256:[0-9a-f]{64}))?$/
export function parseImage(image: string): { repository: string; tag: string | null; digest: string | null } {
  const match = REFERENCE.exec(image)
  if (!match || (!match[2] && !match[3])) throw new Error(`Image ${image} names neither a tag nor a digest`)
  return { repository: match[1], tag: match[2] ?? null, digest: match[3] ?? null }
}
/** `postgres`, `library/postgres` and `docker.io/library/postgres` name the same repository. */
export const canonicalRepository = (repository: string) => repository.replace(/^(?:docker\.io|index\.docker\.io)\//, '').replace(/^library\//, '')

/** The digest-pinned images the candidate's local services start; tag-only entries stay with Compose. */
export function composeImages(text: string): string[] {
  return [...new Set([...text.matchAll(/^\s+image:\s*["']?([^\s"'#]+@sha256:[0-9a-f]{64})["']?\s*$/gm)].map(match => match[1]))]
}

/** The digest `docker image inspect --format '{{json .RepoDigests}}'` printed for the image's repository, if exactly one. */
export function repositoryDigest(image: string, output: string): string | null {
  let digests: unknown
  try { digests = JSON.parse(output.trim()) } catch { return null }
  if (!Array.isArray(digests)) return null
  const repository = canonicalRepository(parseImage(image).repository)
  const found = [...new Set(digests.flatMap(entry => {
    const match = typeof entry === 'string' ? /^(.+)@(sha256:[0-9a-f]{64})$/.exec(entry) : null
    return match && canonicalRepository(match[1]) === repository ? [match[2]] : []
  }))]
  return found.length === 1 ? found[0] : null
}

/** Whether a `docker save` archive's OCI index points at `digest`; anything else is never cached. */
export function archiveNamesDigest(archive: string, digest: string, readIndex = (path: string) => execFileSync('tar', ['-xOf', path, 'index.json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })): boolean {
  try {
    const index = JSON.parse(readIndex(archive)) as { manifests?: { digest?: unknown }[] }
    return Array.isArray(index.manifests) && index.manifests.some(manifest => manifest.digest === digest)
  } catch { return false }
}

const archiveFile = (directory: string, image: string, digest: string) =>
  join(directory, `${canonicalRepository(parseImage(image).repository).replaceAll('/', '+')}@${digest.slice('sha256:'.length)}.tar`)
const tagsFile = (directory: string) => join(directory, 'tags.json')
function readTags(directory: string): Record<string, string> {
  try {
    const tags = JSON.parse(readFileSync(tagsFile(directory), 'utf8')) as unknown
    return tags && typeof tags === 'object' && !Array.isArray(tags) ? Object.fromEntries(Object.entries(tags).filter(([, digest]) => typeof digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(digest))) : {}
  } catch { return {} }
}
function writeTags(directory: string, tags: Record<string, string>): void {
  const partial = `${tagsFile(directory)}.partial-${process.pid}`
  writeFileSync(partial, JSON.stringify(tags, null, 1) + '\n', { mode: 0o600 })
  renameSync(partial, tagsFile(directory))
}

/**
 * Makes `images` present in the candidate daemon, in order. A digest reference expects its own digest; a tag
 * reference expects the digest recorded when it was first cached. Phases: `<phase>-load` and `<phase>-check` for a
 * cached archive (`<phase>-tag` between them); otherwise `<phase>` (the retried pull), `<phase>-digest` and `<phase>-save`.
 */
export async function prepareImages(images: readonly string[], context: ImageCacheContext, phasePrefix = 'image'): Promise<ImageSource[]> {
  mkdirSync(context.directory, { recursive: true, mode: 0o700 })
  const sources: ImageSource[] = []
  for (const [index, image] of images.entries()) {
    const phase = `${phasePrefix}-${index + 1}`, reference = parseImage(image), tags = readTags(context.directory)
    const expected = reference.digest ?? tags[image] ?? null
    const digestOf = async (name: string) => await context.docker(name, ['image', 'inspect', '--format', '{{json .RepoDigests}}', image]) === 0 ? repositoryDigest(image, context.output(name)) : null
    // The image ID is the digest in the containerd store, so tagging by it also refuses any other loaded content.
    if (expected && reference.tag && existsSync(archiveFile(context.directory, image, expected))
      && await context.docker(`${phase}-load`, ['load', '--quiet'], { stdin: archiveFile(context.directory, image, expected) }) === 0
      && await context.docker(`${phase}-tag`, ['tag', expected, `${reference.repository}:${reference.tag}`]) === 0
      && await digestOf(`${phase}-check`) === expected) {
      sources.push({ image, digest: expected, source: 'cache' }); continue
    }
    for (let attempt = 0; ; attempt++) {
      const name = attempt ? `${phase}-a${attempt}` : phase
      if (await context.docker(name, ['pull', '--quiet', image]) === 0) break
      if (attempt + 1 >= context.attempts) throw new Error(`Candidate ${phase} failed: docker pull ${image}`)
      await context.retry()
    }
    const digest = await digestOf(`${phase}-digest`)
    sources.push({ image, digest, source: 'registry' })
    // Caching is best effort: the run already has the image, so a failed save only costs the next run a download.
    if (!digest || !reference.tag || (reference.digest && digest !== reference.digest)) continue
    const archive = archiveFile(context.directory, image, digest), partial = `${archive}.partial-${process.pid}`
    rmSync(partial, { force: true })
    if (await context.docker(`${phase}-save`, ['save', image], { stdout: partial }) === 0 && archiveNamesDigest(partial, digest)) {
      renameSync(partial, archive)
      if (!reference.digest) writeTags(context.directory, { ...readTags(context.directory), [image]: digest })
    } else rmSync(partial, { force: true })
  }
  return sources
}
