import { createHash } from 'node:crypto'
import { getResources } from '../storage/runtime'
import { GitHubApiError } from './github-client'
import type { PrFile } from './code-gen'

export async function readSubmissionArtwork(artUrl: string | null | undefined) {
  if (!artUrl) return null
  const match = /^\/card-art\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.exec(artUrl)
  if (!match) throw new GitHubApiError('unsupported card artwork', 'invalid_art', 400)
  const object = await getResources().read(artUrl.slice(1))
  if (!object) throw new GitHubApiError('card artwork unavailable', 'art_unavailable', 503)
  return { ext: match[1]!.toLowerCase(), buffer: object.body }
}

export function generatedBlobSha(file: PrFile): string {
  const bytes = Buffer.from(file.content,file.encoding === 'base64' ? 'base64' : 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}
