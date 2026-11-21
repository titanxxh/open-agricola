import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyPublishEnvironment } from './container-image-build.ts'
import { assertPrivateReadDenials, checkPrivateRegistry, publishedRegistryManifest } from './container-image-build-registry.ts'
import { CONTAINER_IMAGE_REGISTRY } from './container-images.ts'

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'titanxxh/open-agricola' ||
    process.env.GITHUB_REF !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME ?? '') || !process.env.RUNNER_TEMP) {
  throw new Error('Runtime publication requires a protected-main GitHub build')
}
const recipeTree = execFileSync('git', ['rev-parse', '--verify', 'HEAD:deploy/prerelease-runtime'], { encoding: 'utf8' }).trim()
const api = 'repos/titanxxh/open-agricola/environments/prerelease-image-publish'
const get = (path: string): unknown => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }))
verifyPublishEnvironment(get(api), get(api + '/deployment-branch-policies?per_page=100'))
const credentials = { publisher: process.env.GHCR_PUBLISH_USER ?? '', publishToken: process.env.GHCR_PUBLISH_TOKEN ?? '',
  probeToken: process.env.GH_TOKEN ?? '', expectedPackageId: process.env.GHCR_PRIVATE_PACKAGE_ID ?? '' }
if (!await checkPrivateRegistry(credentials)) throw new Error('Initialize the private GHCR package and its independent ACL first')
const archive = 'oci-archive:' + join(process.env.RUNNER_TEMP, 'runtime.tar')
const raw = execFileSync('skopeo', ['inspect', '--raw', archive])
const manifest: unknown = JSON.parse(raw.toString())
if (!manifest || typeof manifest !== 'object' || !('mediaType' in manifest) || manifest.mediaType !== 'application/vnd.oci.image.manifest.v1+json' ||
    !('config' in manifest) || !manifest.config || typeof manifest.config !== 'object' || !('digest' in manifest.config) ||
    typeof manifest.config.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(manifest.config.digest)) throw new Error('Expected a single-platform OCI image manifest')
const manifestDigest = 'sha256:' + createHash('sha256').update(raw).digest('hex')
const temp = mkdtempSync(join(process.env.RUNNER_TEMP, 'private-runtime-'))
try {
  const auth = join(temp, 'auth.json')
  execFileSync('skopeo', ['login', '--authfile', auth, '--username', credentials.publisher, '--password-stdin', 'ghcr.io'], {input: credentials.publishToken})
  const tag = 'pre-runtime-' + process.env.GITHUB_RUN_ID + '-' + process.env.GITHUB_RUN_ATTEMPT
  execFileSync('skopeo', ['copy', '--authfile', auth, '--preserve-digests', archive, 'docker://' + CONTAINER_IMAGE_REGISTRY + ':' + tag])
  const published = await publishedRegistryManifest(tag, manifest.config.digest, credentials)
  if (published !== manifestDigest) throw new Error('Published runtime manifest differs from the tested image')
  await assertPrivateReadDenials(published, credentials)
  writeFileSync(join(process.env.RUNNER_TEMP, 'prerelease-runtime.ref'), JSON.stringify({format: 1, recipeTree, image: CONTAINER_IMAGE_REGISTRY + '@' + published,
    configDigest: manifest.config.digest}, null, 2) + '\n', { flag: 'wx' })
} finally {
  rmSync(temp, { recursive: true, force: true })
}
