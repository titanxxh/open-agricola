import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { initializeDatabase, getDb } from '../server/db'
import { getResources, closeResources } from '../server/storage/runtime'
import { ReplayResources, parseViewerManifest } from '../server/storage/replay-resources'

const root = process.env.REPLAY_VIEWER_ROOT
const buildId = process.env.REPLAY_VIEWER_BUILD_ID
if (!root || !buildId) throw new Error('REPLAY_VIEWER_ROOT and REPLAY_VIEWER_BUILD_ID are required')
await initializeDatabase()
try {
  const storage = getResources()
  const manifest = await readFile(join(root, buildId, 'manifest.json'))
  const parsed = parseViewerManifest(manifest, buildId)
  for (const path of Object.keys(parsed.files)) {
    await storage.stage(`replay-viewers/${buildId}/${path}`, await readFile(join(root, buildId, path)), 'application/octet-stream')
  }
  await new ReplayResources(storage).publishViewer(buildId, manifest)
  console.log(`[viewer] Immutable build ${buildId} available in shared storage`)
} finally { closeResources(); await getDb().close() }
