import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export type ReplayViewerBuild = {
  directory: string
  entrypoint: 'index.html'
  files: Record<string, string>
}

const verifiedBuilds = new Map<string, ReplayViewerBuild>()

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
  if (cached && !revalidate) return cached
  if (revalidate) verifiedBuilds.delete(directory)
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
    if (!files.every((path) =>
      /^[a-f0-9]{64}$/.test(expected[path] as string)
      && fileHash(join(directory, path)) === expected[path]
    )) return null
    const build: ReplayViewerBuild = {
      directory,
      entrypoint: 'index.html',
      files: expected as Record<string, string>,
    }
    verifiedBuilds.set(directory, build)
    return build
  } catch {
    return null
  }
}

export const viewerBuildExists = (root: string, buildId: string): boolean =>
  loadReplayViewerBuild(root, buildId, true) !== null
