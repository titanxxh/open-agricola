import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const LOCAL_PUBLIC_ASSET_BASE_URL = '/__public-assets__/'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const ASSET_PATH_PATTERN = /^assets\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/
const PUBLISHED_ASSET_EXTENSION = /\.(jpg|png|webp|woff2|woff|ttf|txt)$/

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

type PublicAssetManifest = {
  version: string
  files: string[]
}

export type PublicAssetConfig = {
  baseUrl: string
  version: string
  requiredFiles: string[]
  digests?: Readonly<Record<string, string>>
  localDir?: string
  /** The local directory is a verified checkout of `version`: a missing file is a 404, as on the asset site. */
  pinned?: boolean
}

export const publicAssetBaseUrl = (): string =>
  'https://titanxxh.github.io/open-agricola-assets/'

/**
 * True only for the Vite CLI running the development server. Builds, previews, Vitest and scripts that call
 * Vite's JavaScript API (which can build without `build` in argv) are never the development server.
 */
export const isViteDevServerCli = (
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  env.VITEST !== 'true'
  && /(?:^|[\\/])vite(?:\.js)?$/.test(argv[1] ?? '')
  && !argv.slice(2).some(arg => arg === 'build' || arg === 'preview' || arg === 'optimize')

/** The asset base URL the development server uses in this environment; browser tests compare against it. */
export const devServerPublicAssetBaseUrl = (env: NodeJS.ProcessEnv = process.env): string =>
  env.PUBLIC_ASSET_LOCAL_DIR || env.E2E_PUBLIC_ASSET_DIR ? LOCAL_PUBLIC_ASSET_BASE_URL : publicAssetBaseUrl()

const parseFileList = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || value.some(file => typeof file !== 'string')) {
    throw new Error(`${label} files must be an array of paths`)
  }

  const files = value as string[]
  for (const file of files) {
    if (
      !ASSET_PATH_PATTERN.test(file)
      || file.split('/').some(part => part === '.' || part === '..')
    ) {
      throw new Error(`${label} contains invalid path: ${file}`)
    }
  }
  if (new Set(files).size !== files.length) {
    throw new Error(`${label} contains duplicate paths`)
  }
  const sortedFiles = [...files].sort()
  if (files.some((file, index) => file !== sortedFiles[index])) {
    throw new Error(`${label} files must be sorted`)
  }
  return files
}

const parseManifest = (value: unknown): PublicAssetManifest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Public asset manifest must be an object')
  }
  const inventory = value as Record<string, unknown>
  if (
    Object.keys(inventory).sort().join(',') !== 'files,version'
    || typeof inventory.version !== 'string'
    || !SHA_PATTERN.test(inventory.version)
  ) {
    throw new Error('Invalid public asset manifest')
  }
  return {
    version: inventory.version,
    files: parseFileList(inventory.files, 'Public asset manifest'),
  }
}

const parseDigests = (text: string, manifest: PublicAssetManifest): Record<string, string> => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error('Invalid public asset digests JSON', { cause: error })
  }
  if (
    !value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'digests,version'
    || !('version' in value) || typeof value.version !== 'string' || !SHA_PATTERN.test(value.version)
    || !('digests' in value) || !value.digests || typeof value.digests !== 'object' || Array.isArray(value.digests)
  ) {
    throw new Error('Invalid public asset digests')
  }
  if (value.version !== manifest.version) {
    throw new Error(`Public asset digests version does not match ${manifest.version}`)
  }

  const missing = new Set(manifest.files)
  const digests: Record<string, string> = {}
  for (const [file, digest] of Object.entries(value.digests)) {
    if (!missing.delete(file)) throw new Error(`Public asset digests contain unexpected file: ${file}`)
    if (typeof digest !== 'string' || !SHA256_PATTERN.test(digest)) {
      throw new Error(`Invalid public asset SHA-256: ${file}`)
    }
    digests[file] = digest
  }
  if (missing.size) throw new Error(`Public asset digests are missing file: ${missing.values().next().value}`)
  return digests
}

const readJson = async (filePath: string, label: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${filePath}`, { cause: error })
  }
}

const fetchText = async (url: URL, fetcher: Fetcher, init?: RequestInit): Promise<string> => {
  let response: Response
  try {
    response = await fetcher(url, init)
  } catch (error) {
    throw new Error(`Cannot fetch public asset metadata: ${url}`, { cause: error })
  }
  if (!response.ok) {
    throw new Error(`Cannot fetch public asset metadata: ${url} returned ${response.status}`)
  }
  return response.text()
}

/** A clean asset-repository checkout at exactly `version` that tracks and contains every required file. */
const assertPinnedCheckout = async (directory: string, version: string, requiredFiles: string[]): Promise<string[]> => {
  const git = (...args: string[]): string => execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (git('rev-parse', 'HEAD') !== version) {
    throw new Error(`Public asset checkout version does not match ${version}`)
  }
  if (git('status', '--porcelain', '--untracked-files=all', '--', 'assets')) {
    throw new Error('Public asset checkout assets must be clean')
  }
  const available = new Set(git('ls-tree', '-r', '--name-only', 'HEAD', '--', 'assets').split('\n'))
  for (const file of requiredFiles) {
    if (!available.has(file) || !(await stat(path.join(directory, file))).isFile()) {
      throw new Error(`Public asset checkout is missing required file: ${file}`)
    }
  }
  return [...available]
}

const hashPinnedAssets = async (directory: string, files: string[]): Promise<Record<string, string>> => {
  const digests: Record<string, string> = {}
  for (const file of parseFileList(files.sort(), 'Public asset checkout')) {
    const asset = path.join(directory, file)
    if (!PUBLISHED_ASSET_EXTENSION.test(file) || !(await lstat(asset)).isFile()) {
      throw new Error(`Unsupported public asset checkout file: ${file}`)
    }
    digests[file] = createHash('sha256').update(await readFile(asset)).digest('hex')
  }
  return digests
}

export const loadPublicAssetConfig = async ({
  rootDir = process.cwd(),
  env = process.env,
  fetcher = fetch,
  allowLocal = !env.CI,
  devServer = false,
  validateRemote = true,
  includeDigests = false,
}: {
  rootDir?: string
  env?: NodeJS.ProcessEnv
  fetcher?: Fetcher
  allowLocal?: boolean
  /** Only the main site's development server honours `E2E_PUBLIC_ASSET_DIR`; every build ignores it. */
  devServer?: boolean
  validateRemote?: boolean
  /** Include the hash table required by the formal Pages asset Worker. */
  includeDigests?: boolean
} = {}): Promise<PublicAssetConfig> => {
  const version = (await readFile(path.join(rootDir, 'public-assets.ref'), 'utf8')).trim()
  if (!SHA_PATTERN.test(version)) {
    throw new Error('public-assets.ref must contain one 40-character lowercase Git SHA')
  }

  const required = await readJson(path.join(rootDir, 'public-assets.required.json'), 'public-assets.required.json')
  const requiredFiles = parseFileList(
    required && typeof required === 'object' ? (required as Record<string, unknown>).files : undefined,
    'public-assets.required.json',
  )
  if (requiredFiles.length === 0) {
    throw new Error('public-assets.required.json must contain at least one path')
  }

  if (includeDigests && (!validateRemote || devServer || env.PUBLIC_ASSET_LOCAL_DIR)) {
    throw new Error('Public asset digests require validated Pages assets')
  }

  if (env.PUBLIC_ASSET_LOCAL_DIR) {
    if (!allowLocal) {
      throw new Error('PUBLIC_ASSET_LOCAL_DIR is only supported by the local development server')
    }
    const localDir = path.resolve(rootDir, env.PUBLIC_ASSET_LOCAL_DIR)
    for (const file of requiredFiles) {
      try {
        if (!(await stat(path.join(localDir, file))).isFile()) throw new Error()
      } catch {
        throw new Error(`PUBLIC_ASSET_LOCAL_DIR is missing required file: ${file}`)
      }
    }
    return { baseUrl: LOCAL_PUBLIC_ASSET_BASE_URL, version, requiredFiles, localDir }
  }

  // Browser verification from one address must not depend on the asset site's request limits. The development
  // server then serves the pinned checkout itself, also under CI; nothing is fetched and nothing falls back.
  if (devServer && env.E2E_PUBLIC_ASSET_DIR) {
    const localDir = path.resolve(rootDir, env.E2E_PUBLIC_ASSET_DIR)
    await assertPinnedCheckout(localDir, version, requiredFiles)
    return { baseUrl: LOCAL_PUBLIC_ASSET_BASE_URL, version, requiredFiles, localDir, pinned: true }
  }

  if (!validateRemote) {
    return { baseUrl: publicAssetBaseUrl(), version, requiredFiles }
  }

  if (env.PUBLIC_ASSET_VALIDATION_DIR) {
    const directory = path.resolve(rootDir, env.PUBLIC_ASSET_VALIDATION_DIR)
    const files = await assertPinnedCheckout(directory, version, requiredFiles)
    const config = { baseUrl: publicAssetBaseUrl(), version, requiredFiles }
    return includeDigests ? { ...config, digests: await hashPinnedAssets(directory, files) } : config
  }

  const baseUrl = publicAssetBaseUrl()
  const metadataUrl = (file: string): URL => {
    const url = new URL(file, baseUrl)
    url.searchParams.set('v', version)
    return url
  }
  const requestOptions: RequestInit = {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  }
  const [liveVersion, manifestText, digestsText] = await Promise.all([
    fetchText(metadataUrl('asset-version.txt'), fetcher, requestOptions),
    fetchText(metadataUrl('asset-manifest.json'), fetcher, requestOptions),
    includeDigests ? fetchText(metadataUrl('asset-digests.json'), fetcher, requestOptions) : undefined,
  ])
  if (liveVersion.trim() !== version) {
    throw new Error(`Public asset Pages version does not match ${version}`)
  }
  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(manifestText)
  } catch (error) {
    throw new Error('Invalid public asset manifest JSON', { cause: error })
  }
  const manifest = parseManifest(manifestValue)
  if (manifest.version !== version) {
    throw new Error(`Public asset manifest version does not match ${version}`)
  }
  const available = new Set(manifest.files)
  const missing = requiredFiles.find(file => !available.has(file))
  if (missing) {
    throw new Error(`Public asset manifest is missing required file: ${missing}`)
  }

  const config = { baseUrl, version, requiredFiles }
  return digestsText === undefined ? config : { ...config, digests: parseDigests(digestsText, manifest) }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const rewriteCssPublicAssetUrls = (
  code: string,
  prefix: string,
  config: Pick<PublicAssetConfig, 'baseUrl'>,
): string => {
  const pattern = new RegExp(
    `url\\(\\s*(['"]?)${escapeRegExp(prefix)}assets\\/([^'")]+)\\1\\s*\\)`,
    'g',
  )
  return code.replace(
    pattern,
    (_match: string, quote: string, relative: string) =>
      `url(${quote}${config.baseUrl}assets/${relative}${quote})`,
  )
}

export const publicAssetUrls = (
  config: PublicAssetConfig,
  prefixes = ['/'],
) => {
  const rewrite = (code: string): string =>
    [...new Set(prefixes)].reduce(
      (result, prefix) => rewriteCssPublicAssetUrls(result, prefix, config),
      code,
    )

  return {
    name: 'public-asset-urls',
    enforce: 'post' as const,
    transform(code: string, id: string) {
      if (!id.split('?', 1)[0].endsWith('.css')) return null
      const transformed = rewrite(code)
      return transformed === code ? null : { code: transformed, map: null }
    },
    transformIndexHtml(html: string) {
      return html.replaceAll('"__PUBLIC_ASSET_BASE_URL__"', JSON.stringify(config.baseUrl))
    },
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string; source?: string | Uint8Array }>,
    ) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css') || typeof file.source !== 'string') {
          continue
        }
        file.source = rewrite(file.source)
      }
    },
  }
}
