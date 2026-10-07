import { createHash } from 'node:crypto'
import type { PostgresDatabase } from '../database/postgres'
import { generatePrFiles } from './code-gen'
import { GitHubApiError, GitHubClient } from './github-client'
import type { SubmissionPayload } from './submission-store'
import { getResources } from '../storage/runtime'

/** Reconstruct only a verifiable legacy baseline; never write to or alter the old fork. */
export async function verifyLegacySubmission(db: PostgresDatabase, client: GitHubClient, data: SubmissionPayload, url: string) {
  const match = new RegExp(`^https://github\\.com/${data.owner}/${data.repository}/pull/(\\d+)$`).exec(url)
  if (!match) throw new GitHubApiError('legacy PR target differs','legacy_review_required',409)
  const number = Number(match[1])
  const pr = await client.getPullRequest(number)
  if (pr.merged) throw new GitHubApiError('legacy PR has merged','pr_merged',409)
  if (pr.draft || pr.base !== 'main') throw new GitHubApiError('legacy PR paused','pr_paused',409)
  const version = await db.prepare(`SELECT v.card_json,v.art_url,c.review_commit_sha FROM workshop_card_versions v
    JOIN workshop_cards c ON c.review_version_id = v.id WHERE c.id = ?`).get<{card_json:string;art_url:string|null;review_commit_sha:string|null}>(data.wcard.id)
  if (!version?.review_commit_sha) throw new GitHubApiError('legacy version baseline missing','legacy_review_required',409)
  const meta = JSON.parse(version.card_json) as Record<string,unknown>
  const cardId = String(meta.id)
  if (!/^CUSTOM_[A-Za-z][A-Za-z0-9_]*$/.test(cardId)) throw new GitHubApiError('legacy card identity invalid','legacy_review_required',409)
  const mainSha = await client.getUpstreamMainSha()
  let artData: {ext:string;buffer:Buffer} | null = null
  if (version.art_url) {
    const artMatch = /^\/card-art\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.exec(version.art_url)
    const stored = artMatch ? await getResources().read(version.art_url.slice(1)) : undefined
    if (!artMatch || !stored) throw new GitHubApiError('legacy artwork baseline missing','legacy_review_required',409)
    artData = {ext:artMatch[1]!.toLowerCase(),buffer:stored.body}
  }
  const [register,catalog,index] = await Promise.all(['shared/cards/register-all.ts','shared/cards/catalog.generated.ts','docs/community_cards.md'].map(path => client.getUpstreamFile(path,mainSha)))
  const files = await generatePrFiles({wcard:{...data.wcard,card_id:cardId,card_type:meta.card_type === 'occupation' ? 'occupation' : 'minor',card_json:version.card_json,effect_code:String(meta._code ?? ''),art_url:version.art_url},
    github_login:'',designer_name:data.wcard.author_name,pr_number:number,art_data:artData,
    upstream_register_all:register!,upstream_catalog_generated:catalog!,upstream_community_md:index!})
  const source = files.find(file => file.path === `shared/cards/community/${cardId}.ts`)!
  const actual = await client.getUpstreamFile(source.path,pr.headSha)
  // Only provenance header lines differed between the OAuth and App generators.
  const stripHeader = (text:string) => text.replace(/^\/\/ Generated from Open Agricola workshop[^\n]*\n\/\/ Workshop card:[^\n]*\n\/\/ (?:Author|Designer):[^\n]*\n\/\/ Submitted:[^\n]*\n/,'')
  if (stripHeader(source.content) !== stripHeader(actual)) throw new GitHubApiError('legacy source changed','generated_file_changed',409)
  for (const path of ['shared/cards/register-all.ts','shared/cards/catalog.generated.ts','docs/community_cards.md']) {
    const [baseline,current] = await Promise.all([client.getFileSha(path,version.review_commit_sha),client.getFileSha(path,pr.headSha)])
    if (!baseline) throw new GitHubApiError('legacy index baseline missing','legacy_review_required',409)
    if (baseline !== current) throw new GitHubApiError('legacy index changed','generated_file_changed',409)
  }
  for (const file of files.filter(file => file.encoding === 'base64')) {
    const bytes = Buffer.from(file.content,'base64')
    const expected = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (await client.getFileSha(file.path,pr.headSha) !== expected) throw new GitHubApiError('legacy artwork changed','generated_file_changed',409)
  }
  return {number,url,headSha:pr.headSha,generatedPaths:files.map(file => file.path)}
}
