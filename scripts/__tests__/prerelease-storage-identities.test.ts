import { readFileSync } from 'node:fs'
import { beforeEach, expect, it, vi } from 'vitest'
import { parsePrereleaseTarget, type PrereleaseTarget } from '../prerelease/config'

const state = vi.hoisted(() => ({ target: undefined as unknown, closed: false, queries: [] as string[] }))

// Asynchronous like the real pool; a pool used after close() fails as pg does.
vi.mock('../../server/database/postgres', () => ({
  PostgresDatabase: class {
    prepare(sql: string) {
      const target = state.target as PrereleaseTarget
      const rows = async (): Promise<Record<string, unknown>[]> => {
        await new Promise(resolve => setTimeout(resolve, 1))
        if (state.closed) throw new Error('Cannot use a pool after calling end on the pool')
        state.queries.push(sql)
        if (sql.includes('FROM pg_roles r WHERE r.rolname=current_user')) return [{ database: target.database.name, role: target.database.appRole,
          rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false, rolconnlimit: 5, formal_connect: false }]
        if (sql.includes("to_regclass('prerelease_retained_identity_refs')")) return [{ name: 'prerelease_retained_identity_refs' }]
        if (sql.includes('FROM prerelease_retained_identity_refs LIMIT')) return [{ user_id: 'player-1', source_grant_id: 'A'.repeat(43) }]
        return []
      }
      return { get: async () => (await rows())[0], all: rows, run: async () => ({ changes: 0 }) }
    }
    async close() { state.closed = true }
  },
}))

vi.mock('../../server/storage/s3-store', () => ({ S3ObjectStore: { fromEnv: () => ({ close() {} }) } }))

vi.mock('@aws-sdk/client-s3', () => {
  class ListObjectsV2Command { input: { Bucket: string; Prefix?: string }; constructor(input: { Bucket: string; Prefix?: string }) { this.input = input } }
  class DeleteObjectCommand { input: unknown; constructor(input: unknown) { this.input = input } }
  class S3Client {
    async send(command: ListObjectsV2Command) {
      const target = state.target as PrereleaseTarget
      if (command.input.Bucket === target.formal.bucket || command.input.Prefix === 'test/') throw Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } })
      return { Contents: [] }
    }
    destroy() {}
  }
  return { S3Client, ListObjectsV2Command, DeleteObjectCommand }
})

beforeEach(() => { state.closed = false; state.queries = [] })

it('returns the retained identity manifest before closing the storage connections', async () => {
  const target = parsePrereleaseTarget(JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')))
  state.target = target
  const { operatePrereleaseStorage } = await import('../prerelease/storage')
  const env = { RELEASE_CHANNEL: 'prerelease', DATABASE_URL: `postgresql://${target.database.appRole}:x@pre-postgres:5432/${target.database.name}`,
    S3_BUCKET: target.objects.bucket, S3_PREFIX: target.objects.prefix, S3_ACCESS_KEY_ID: 'app', S3_SECRET_ACCESS_KEY: 'secret',
    S3_REGION: 'us-east-1', S3_ENDPOINT: 'http://pre-objects:9000', S3_FORCE_PATH_STYLE: 'true' }

  const manifest = await operatePrereleaseStorage(target, 'identities', env)

  expect(manifest).toMatchObject({ protocolVersion: 1, identityCount: 1, refs: [{ userId: 'player-1', sourceGrantId: 'A'.repeat(43) }] })
  expect(state.queries.some(sql => sql.includes('FROM prerelease_retained_identity_refs LIMIT'))).toBe(true)
  expect(state.closed).toBe(true)
}, 30_000)
