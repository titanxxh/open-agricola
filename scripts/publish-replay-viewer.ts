#!/usr/bin/env tsx
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadReplayViewerBuild } from '../server/game/replay-viewer-build.ts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

const hashFile = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

const filesUnder = (root: string, current = root): string[] =>
  readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name)
    if (entry.isDirectory()) return filesUnder(root, path)
    if (!entry.isFile()) throw new Error(`unsupported viewer build entry: ${path}`)
    return [relative(root, path).replaceAll('\\', '/')]
  })

export const publishReplayViewer = (
  targetRoot = resolve(process.env.REPLAY_VIEWER_ROOT ?? join(repoRoot, 'data', 'replay-viewers')),
): { buildId: string; directory: string } => {
  const staging = resolve(repoRoot, 'replay-viewer', '.build')
  if (!existsSync(join(staging, 'index.html'))) throw new Error('replay viewer bundle is missing')
  if (!existsSync(join(staging, 'cards-manifest.json'))) throw new Error('cards manifest is missing')
  const files = filesUnder(staging)
    .filter((path) => path !== 'manifest.json')
    .sort()
  const manifest = Buffer.from(JSON.stringify({
    entrypoint: 'index.html',
    files: Object.fromEntries(files.map((path) => [path, hashFile(join(staging, path))])),
  }))
  const buildId = createHash('sha256').update(manifest).digest('hex')
  writeFileSync(join(staging, 'manifest.json'), manifest)
  mkdirSync(targetRoot, { recursive: true })
  const directory = join(targetRoot, buildId)
  if (!existsSync(directory)) cpSync(staging, directory, { recursive: true, errorOnExist: true })
  if (!loadReplayViewerBuild(targetRoot, buildId)) {
    throw new Error(`published replay viewer failed verification: ${buildId}`)
  }
  rmSync(staging, { recursive: true, force: true })
  return { buildId, directory }
}

if (process.argv[1] && process.argv[1].endsWith('publish-replay-viewer.ts')) {
  const published = publishReplayViewer()
  process.stdout.write(`${published.buildId}\n`)
}
