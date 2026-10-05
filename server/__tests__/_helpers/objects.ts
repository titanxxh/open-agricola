import type { PostgresDatabase } from '../../database/postgres'
import { objectHash } from '../../storage/s3-store'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

/** Test objects always use a separate local bucket and per-test prefix. */
export function testStorageEnvironment(): NodeJS.ProcessEnv {
  const root = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim())
  const values = { ...parseEnv(readFileSync(join(root, 'data/dependencies.local'), 'utf8')), ...process.env }
  return Object.fromEntries(['ENDPOINT', 'BUCKET', 'REGION', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY'].map(key => {
    const value = values[`TEST_S3_${key}`]
    if (!value) throw new Error('Start local test storage with node scripts/local-services.mjs --test')
    return [`S3_${key}`, value]
  }).concat([['S3_FORCE_PATH_STYLE', 'true']]))
}

/** Reference-only aggregate fixtures; these do not assert that bytes exist in S3. */
export async function seedResourceCatalog(db: PostgresDatabase, filenames: string[]): Promise<void> {
  for (const filename of filenames) {
    const body = Buffer.from(filename)
    await db.prepare(`INSERT INTO stored_objects(object_key, content_hash, content_type, size_bytes, state, retain_until, updated_at)
      VALUES (?, ?, 'image/png', ?, 'ready', ?, ?) ON CONFLICT DO NOTHING`).run(`card-art/${filename}`, objectHash(body), body.length, Date.now() + 86400000, Date.now())
  }
}
