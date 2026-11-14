import { createHash, createHmac, randomBytes } from 'node:crypto'

/** Real RustFS IAM credentials, restricted to one throwaway bucket prefix. */
export async function scopedObjectAccount(root: NodeJS.ProcessEnv, bucket: string, prefix: string) {
  if (!/^oa-prerelease-test-[a-f0-9]+$/.test(bucket) || prefix !== 'live/') throw new Error('Expected an isolated native test bucket')
  const accessKey = `test${randomBytes(8).toString('hex')}`, secretKey = randomBytes(32).toString('hex')
  const policyName = `${accessKey}-prefix`
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest()
  const admin = async (method: 'PUT' | 'DELETE', action: string, query: Record<string, string>, payload?: unknown) => {
    if (!root.S3_ENDPOINT || !root.S3_ACCESS_KEY_ID || !root.S3_SECRET_ACCESS_KEY) throw new Error('Missing test object authority')
    const url = new URL(`/rustfs/admin/v3/${action}`, root.S3_ENDPOINT)
    const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    const qs = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&')
    url.search = qs
    const body = payload === undefined ? '' : JSON.stringify(payload)
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0, 8), scope = `${day}/us-east-1/s3/aws4_request`
    const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': hash(body), 'x-amz-date': date }
    if (payload !== undefined) headers['content-type'] = 'application/json'
    const names = Object.keys(headers).sort(), signed = names.join(';')
    const request = [method, url.pathname, qs, names.map(key => `${key}:${headers[key]}\n`).join(''), signed, hash(body)].join('\n')
    const key = hmac(hmac(hmac(hmac(`AWS4${root.S3_SECRET_ACCESS_KEY}`, day), 'us-east-1'), 's3'), 'aws4_request')
    const authorization = `AWS4-HMAC-SHA256 Credential=${root.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${hmac(key, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(request)}`).toString('hex')}`
    const response = await fetch(url, { method, headers: { ...headers, authorization }, body: body || undefined,
      redirect: 'error', signal: AbortSignal.timeout(15_000) })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`Native test object account operation failed with HTTP ${response.status}`)
  }
  let userCreated = false, policyCreated = false
  const release = async () => {
    try { if (userCreated) await admin('DELETE', 'remove-user', { accessKey }) }
    finally { if (policyCreated) await admin('DELETE', 'remove-canned-policy', { name: policyName }) }
  }
  try {
    await admin('PUT', 'add-canned-policy', { name: policyName }, { Version: '2012-10-17', Statement: [
        { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: [`arn:aws:s3:::${bucket}`], Condition: { StringLike: { 's3:prefix': [prefix, `${prefix}*`] } } },
        { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: [`arn:aws:s3:::${bucket}/${prefix}*`] },
      ] })
    policyCreated = true
    await admin('PUT', 'add-user', { accessKey }, { secretKey, status: 'enabled' })
    userCreated = true
    await admin('PUT', 'set-user-or-group-policy', { policyName, userOrGroup: accessKey, isGroup: 'false' })
  } catch (error) { await release().catch(() => {}); throw error }
  return { env: { ...root, S3_BUCKET: bucket, S3_PREFIX: prefix, S3_ACCESS_KEY_ID: accessKey, S3_SECRET_ACCESS_KEY: secretKey }, release }
}
