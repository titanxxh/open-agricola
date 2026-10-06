import { measure, operationsMetrics, safe } from '../observability/metrics'
import { createHash } from 'node:crypto'
import {
  DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3'

export class ObjectConflictError extends Error {}
export const objectHash = (body: Uint8Array): string => createHash('sha256').update(body).digest('hex')
export type StoredObject = { body: Buffer; contentType: string; etag: string }
const status = (error: unknown): number | undefined =>
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode

/** The same private-bucket protocol is used on a local host and managed S3. */
export class S3ObjectStore {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly prefix: string

  constructor(client: S3Client, bucket: string, prefix = '') {
    this.client = client
    this.bucket = bucket
    this.prefix = prefix
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env, prefix = env.S3_PREFIX ?? ''): S3ObjectStore {
    const required = (key: string): string => {
      const value = env[key]
      if (!value) throw new Error(`Missing object storage configuration: ${key}`)
      return value
    }
    return new S3ObjectStore(new S3Client({
      endpoint: required('S3_ENDPOINT'), region: required('S3_REGION'),
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId: required('S3_ACCESS_KEY_ID'), secretAccessKey: required('S3_SECRET_ACCESS_KEY') },
      // Bound service calls so a dead endpoint cannot occupy a DB claim indefinitely.
      requestHandler: { requestTimeout: 30_000, connectionTimeout: 5_000 }, maxAttempts: 3,
    }), required('S3_BUCKET'), prefix)
  }

  async get(key: string): Promise<StoredObject | null> {
    return measure('s3_get', async () => {
      const result = await this.getBody(key)
      if (result) safe(() => operationsMetrics.s3Bytes.inc({ kind: 'get' }, result.body.length))
      return result
    })
  }

  private async getBody(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.prefix + key }))
      if (!result.Body || !result.ETag) throw new Error('Object store returned incomplete content')
      return { body: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType ?? 'application/octet-stream', etag: result.ETag }
    } catch (error) {
      if (status(error) === 404) return null
      throw error
    }
  }

  async putImmutable(key: string, body: Buffer, contentType: string): Promise<void> {
    return measure('s3_put', async () => {
      const result = await this.putImmutableBody(key, body, contentType)
      safe(() => operationsMetrics.s3Bytes.inc({ kind: 'put' }, body.length))
      return result
    })
  }

  private async putImmutableBody(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.prefix + key, Body: body, ContentType: contentType, IfNoneMatch: '*' }))
    } catch (error) {
      if (status(error) !== 412 && status(error) !== 409) throw error
      const existing = await this.get(key)
      if (!existing || !existing.body.equals(body)) throw new ObjectConflictError(`Immutable object conflict: ${key}`)
    }
  }

  /** CAS for the independent erasure ledger. null means create only. */
  async replace(key: string, body: Buffer, previousEtag: string | null): Promise<string> {
    return measure('s3_put', async () => {
      const result = await this.replaceBody(key, body, previousEtag)
      safe(() => operationsMetrics.s3Bytes.inc({ kind: 'put' }, body.length))
      return result
    })
  }

  private async replaceBody(key: string, body: Buffer, previousEtag: string | null): Promise<string> {
    try {
      const result = await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: this.prefix + key, Body: body, ContentType: 'application/json',
        ...(previousEtag === null ? { IfNoneMatch: '*' } : { IfMatch: previousEtag }),
      }))
      if (!result.ETag) throw new Error('Object store returned no ETag')
      return result.ETag
    } catch (error) {
      if (status(error) === 412 || status(error) === 409) throw new ObjectConflictError(`Conditional object conflict: ${key}`)
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    return measure('s3_delete', async () => {
      const result = await this.deleteBody(key)
      return result
    })
  }

  private async deleteBody(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.prefix + key }))
  }

  /** Intended for test teardown and explicit namespace migration tooling only. */
  async clearPrefix(): Promise<void> {
    if (!this.prefix.startsWith('test/') || this.prefix.length < 10) throw new Error('Only isolated test prefixes may be cleared')
    let continuationToken: string | undefined
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.prefix, ContinuationToken: continuationToken }))
      for (const item of page.Contents ?? []) {
        if (item.Key) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: item.Key }))
      }
      continuationToken = page.NextContinuationToken
    } while (continuationToken)
  }

  close(): void { this.client.destroy() }
}
