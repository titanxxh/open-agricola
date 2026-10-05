import { GameContextStore } from '../../game/game-context-store'
import { randomUUID } from 'node:crypto'
import type { PostgresDatabase } from '../../database/postgres'
import { S3ObjectStore, objectHash } from '../../storage/s3-store'
import { ResourceStore } from '../../storage/resource-store'
import { ReplayResources } from '../../storage/replay-resources'
import { testStorageEnvironment } from './objects'

/** Small real immutable Viewer used by hosted Room lifecycle integration tests. */
export async function recordingResources(db: PostgresDatabase) {
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  const resources = new ResourceStore(db, objects)
  const replayResources = new ReplayResources(resources)
  const html = Buffer.from('<main>Recorded Room integration test</main>')
  const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(html) } }))
  const buildId = objectHash(manifest)
  await resources.stage(`replay-viewers/${buildId}/index.html`, html, 'text/html')
  await replayResources.publishViewer(buildId, manifest)
  return {
    resources: replayResources,
    gameContextStore: new GameContextStore(db),
    replay: { viewerBuildId: buildId, gameBuildId: 'test-build' },
    close: async () => { try { await objects.clearPrefix() } finally { objects.close() } },
  }
}
