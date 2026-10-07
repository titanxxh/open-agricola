import { createHash } from 'node:crypto'
import { getResources } from '../storage/runtime'
import { cardArtKey } from '../../shared/utils/card-art-url'
import { GitHubApiError } from './github-client'
import type { PrFile } from './code-gen'

export async function readSubmissionArtwork(artUrl: string | null | undefined) {
  if (!artUrl) return null
  const key = cardArtKey(artUrl)
  if (!key) throw new GitHubApiError('unsupported card artwork', 'invalid_art', 400)
  const object = await getResources().read(key)
  if (!object) throw new GitHubApiError('card artwork unavailable', 'art_unavailable', 503)
  return { ext: key.split('.').at(-1)!.toLowerCase(), buffer: object.body }
}

export function generatedBlobSha(file: PrFile): string {
  const bytes = Buffer.from(file.content,file.encoding === 'base64' ? 'base64' : 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}
