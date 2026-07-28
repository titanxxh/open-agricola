import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export type ReplayViewerBuild = {
  directory: string
  entrypoint: 'index.html'
  files: Record<string, string>
  fileMetadata: Record<string, {
    size: number
    mtimeMs: number
  }>
}

const REVALIDATE_INTERVAL_MS = 60_000
const verifiedBuilds = new Map<string, {
  build: ReplayViewerBuild
  verifiedAt: number
}>()

const fileHash = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

const viewerFiles = (root: string, relative = ''): string[] => {
  const files: string[] = []
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...viewerFiles(root, path))
    else if (entry.isFile() && path !== 'manifest.json') files.push(path)
    else if (!entry.isFile()) throw new Error('viewer build contains unsupported entries')
  }
  return files.sort()
}

export const loadReplayViewerBuild = (
  root: string,
  buildId: string,
  revalidate = false,
): ReplayViewerBuild | null => {
  if (!/^[a-f0-9]{64}$/.test(buildId)) return null
  const directory = join(root, buildId)
  const cached = verifiedBuilds.get(directory)
  if (cached) {
    if (
      !existsSync(join(directory, 'manifest.json'))
      || !existsSync(join(directory, cached.build.entrypoint))
    ) {
      verifiedBuilds.delete(directory)
      return null
    }
    if (
      !revalidate
      || Date.now() - cached.verifiedAt < REVALIDATE_INTERVAL_MS
    ) return cached.build
    verifiedBuilds.delete(directory)
  }
  try {
    if (!lstatSync(directory).isDirectory()) return null
    const manifestPath = join(directory, 'manifest.json')
    const manifestRaw = readFileSync(manifestPath)
    if (createHash('sha256').update(manifestRaw).digest('hex') !== buildId) return null
    const manifest = JSON.parse(manifestRaw.toString('utf8')) as {
      entrypoint?: unknown
      files?: unknown
    }
    if (
      manifest.entrypoint !== 'index.html'
      || !manifest.files
      || typeof manifest.files !== 'object'
      || Array.isArray(manifest.files)
    ) return null
    const expected = manifest.files as Record<string, unknown>
    const files = viewerFiles(directory)
    if (
      files.length !== Object.keys(expected).length
      || !files.every((path) => typeof expected[path] === 'string')
      || !files.includes('index.html')
    ) return null
    const fileMetadata: ReplayViewerBuild['fileMetadata'] = {}
    if (!files.every((path) => {
      const filePath = join(directory, path)
      const stat = lstatSync(filePath)
      fileMetadata[path] = {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      }
      return /^[a-f0-9]{64}$/.test(expected[path] as string)
        && fileHash(filePath) === expected[path]
    })) return null
    const manifestStat = lstatSync(manifestPath)
    fileMetadata['manifest.json'] = {
      size: manifestStat.size,
      mtimeMs: manifestStat.mtimeMs,
    }
    const build: ReplayViewerBuild = {
      directory,
      entrypoint: 'index.html',
      files: expected as Record<string, string>,
      fileMetadata,
    }
    verifiedBuilds.set(directory, { build, verifiedAt: Date.now() })
    return build
  } catch {
    return null
  }
}

export const viewerBuildExists = (root: string, buildId: string): boolean =>
  loadReplayViewerBuild(root, buildId, true) !== null
