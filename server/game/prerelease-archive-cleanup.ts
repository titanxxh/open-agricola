import type { PostgresDatabase } from '../database/postgres'
import type { ResourceStore } from '../storage/resource-store'
import { parseViewerManifest } from '../storage/replay-resources'
import { expirePrereleaseReplay } from './replay-removal'
import { PRERELEASE_ARCHIVE_RETENTION_MS } from './prerelease-archive-retention'

/** Only obsolete programs can lose their global references; resources keep backup locks. */
export async function retireUnusedPrereleaseViewers(resources: ResourceStore, installedBuildId: string): Promise<string[]> {
  if (process.env.RELEASE_CHANNEL !== 'prerelease') return []
  if (!/^[a-f0-9]{64}$/.test(installedBuildId)) throw new Error('Installed Viewer identity is required for collection')
  const retired = await resources.db.transaction(async () => {
    const rows = await resources.db.prepare(`SELECT b.build_id,b.manifest_text FROM replay_viewer_builds b
      WHERE b.build_id<>?
        AND NOT EXISTS (SELECT 1 FROM rooms room WHERE room.replay_viewer_build_id=b.build_id)
        AND NOT EXISTS (SELECT 1 FROM game_replays r JOIN game_contexts c USING(room_id)
          WHERE r.viewer_build_id=b.build_id AND (c.lifecycle IN ('active','completed','terminated')
            OR EXISTS (SELECT 1 FROM bug_reports report JOIN game_replay_steps step
              ON step.room_id=report.room_id AND step.step_no=report.step_no AND step.frame_hash=report.frame_hash
              WHERE report.room_id=r.room_id AND report.lifecycle='active' AND report.submitted_at IS NOT NULL
                AND report.evidence_expires_at>?)))
      ORDER BY b.build_id LIMIT 20 FOR UPDATE OF b SKIP LOCKED`).all<{ build_id: string; manifest_text: string }>(installedBuildId, Date.now())
    const entries: Array<{ id: string; keys: string[] }> = []
    for (const row of rows) {
      const manifest = parseViewerManifest(Buffer.from(row.manifest_text), row.build_id)
      await resources.release('viewer', row.build_id)
      await resources.db.prepare('DELETE FROM replay_viewer_builds WHERE build_id=?').run(row.build_id)
      entries.push({ id: row.build_id, keys: [...Object.keys(manifest.files), 'manifest.json'].map(file => `replay-viewers/${row.build_id}/${file}`) })
    }
    return entries
  })()
  await resources.removeUnreferenced(retired.flatMap(entry => entry.keys))
  return retired.map(entry => entry.id)
}

/** Reads enforce the deadline immediately; this bounded sweep reclaims durable data. */
export async function collectPrereleaseArchives(
  db: PostgresDatabase,
  resources: ResourceStore,
  installedViewerBuildId: string,
  now: () => number = Date.now,
): Promise<{ roomIds: string[]; viewerBuildIds: string[] }> {
  if (process.env.RELEASE_CHANNEL !== 'prerelease') return { roomIds: [], viewerBuildIds: [] }
  const candidates = await db.prepare(`SELECT c.room_id FROM game_contexts c
    JOIN LATERAL (SELECT MIN(ended_at) AS ended_at FROM (
      SELECT finished_at AS ended_at FROM game_results WHERE room_id=c.room_id
      UNION ALL SELECT ended_at FROM game_terminations WHERE room_id=c.room_id
      UNION ALL SELECT completed_at AS ended_at FROM game_replays WHERE room_id=c.room_id
    ) endings) e ON TRUE
    WHERE c.lifecycle IN ('completed','terminated','removed') AND e.ended_at<=?
    ORDER BY e.ended_at,c.room_id LIMIT 100`).all<{ room_id: string }>(now() - PRERELEASE_ARCHIVE_RETENTION_MS)
  const roomIds: string[] = []
  for (const row of candidates) if (await expirePrereleaseReplay(db, { roomId: row.room_id, resources, now })) roomIds.push(row.room_id)
  const viewerBuildIds = /^[a-f0-9]{64}$/.test(installedViewerBuildId) ? await retireUnusedPrereleaseViewers(resources, installedViewerBuildId) : []
  return { roomIds, viewerBuildIds }
}
