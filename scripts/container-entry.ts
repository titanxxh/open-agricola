import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { initializeDatabase } from '../server/db'
import { getResources, closeResources } from '../server/storage/runtime'
import { ReplayResources, parseViewerManifest } from '../server/storage/replay-resources'

// Immutable Viewer bundles travel with the build, then live in shared S3.
const root = '/app/viewer-builds'
const builds = (await readdir(root)).filter(name => /^[a-f0-9]{64}$/.test(name))
if (builds.length !== 1) throw new Error('Application image must contain exactly one immutable Viewer build')
process.env.REPLAY_VIEWER_BUILD_ID = builds[0]
await initializeDatabase()
const resources = getResources()
try {
  const manifest = await readFile(join(root, builds[0], 'manifest.json'))
  const parsed = parseViewerManifest(manifest, builds[0])
  for (const path of Object.keys(parsed.files)) {
    await resources.stage(`replay-viewers/${builds[0]}/${path}`, await readFile(join(root, builds[0], path)), 'application/octet-stream')
  }
  await new ReplayResources(resources).publishViewer(builds[0], manifest)
} finally { closeResources() }
// local-backend uses this initialized pool and closes it on shutdown.
await import('./local-backend')
