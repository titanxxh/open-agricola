import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const LOCAL_PUBLIC_ASSET_BASE_URL = '/__public-assets__/'
const PUBLIC_ASSET_REPOSITORY = 'titanxxh/open-agricola-assets'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const ASSET_PATH_PATTERN = /^assets\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>

type PublicAssetTree = {
  truncated: boolean
  tree: Array<{
    path: string
    type: string
  }>
}

export type PublicAssetConfig = {
  baseUrl: string
  version: string
  requiredFiles: string[]
  localDir?: string
}

export const publicAssetBaseUrl = (version: string): string =>
  `https://raw.githubusercontent.com/titanxxh/open-agricola-assets/${version}/`

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

const parseTree = (value: unknown, label: string): PublicAssetTree => {
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} must be an object`)
  }
  const inventory = value as Record<string, unknown>
  if (inventory.truncated !== false || !Array.isArray(inventory.tree)) {
    throw new Error(`${label} must contain a complete tree`)
  }
  const tree = inventory.tree
  if (tree.some(entry => (
    !entry
    || typeof entry !== 'object'
    || typeof (entry as Record<string, unknown>).path !== 'string'
    || typeof (entry as Record<string, unknown>).type !== 'string'
  ))) {
    throw new Error(`${label} contains an invalid entry`)
  }
  return { truncated: false, tree: tree as PublicAssetTree['tree'] }
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
    throw new Error(`Cannot fetch public asset inventory: ${url}`, { cause: error })
  }
  if (!response.ok) {
    throw new Error(`Cannot fetch public asset inventory: ${url} returned ${response.status}`)
  }
  return response.text()
}

export const loadPublicAssetConfig = async ({
  rootDir = process.cwd(),
  env = process.env,
  fetcher = fetch,
  allowLocal = !env.CI,
  validateRemote = true,
}: {
  rootDir?: string
  env?: NodeJS.ProcessEnv
  fetcher?: Fetcher
  allowLocal?: boolean
  validateRemote?: boolean
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

  if (!validateRemote) {
    return { baseUrl: publicAssetBaseUrl(version), version, requiredFiles }
  }

  let inventoryValue: unknown
  try {
    inventoryValue = JSON.parse(await fetchText(
      new URL(`https://api.github.com/repos/${PUBLIC_ASSET_REPOSITORY}/git/trees/${version}?recursive=1`),
      fetcher,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(env.GITHUB_TOKEN || env.GH_TOKEN
            ? { Authorization: `Bearer ${env.GITHUB_TOKEN || env.GH_TOKEN}` }
            : {}),
        },
      },
    ))
  } catch (error) {
    throw new Error('Invalid public asset inventory JSON', { cause: error })
  }
  const inventory = parseTree(inventoryValue, 'public asset inventory')
  const available = new Set(
    inventory.tree
      .filter(entry => entry.type === 'blob')
      .map(entry => entry.path),
  )
  const missing = requiredFiles.find(file => !available.has(file))
  if (missing) {
    throw new Error(`Public asset inventory is missing required file: ${missing}`)
  }

  return { baseUrl: publicAssetBaseUrl(version), version, requiredFiles }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const rewriteCssPublicAssetUrls = (
  code: string,
  prefix: string,
  config: Pick<PublicAssetConfig, 'baseUrl' | 'version'>,
): string => {
  const pattern = new RegExp(
    `url\\(\\s*(['"]?)${escapeRegExp(prefix)}assets\\/([^'")]+)\\1\\s*\\)`,
    'g',
  )
  return code.replace(
    pattern,
    (_match: string, quote: string, relative: string) =>
      `url(${quote}${config.baseUrl}assets/${relative}?v=${encodeURIComponent(config.version)}${quote})`,
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
      return html
        .replaceAll('"__PUBLIC_ASSET_BASE_URL__"', JSON.stringify(config.baseUrl))
        .replaceAll('"__PUBLIC_ASSET_VERSION__"', JSON.stringify(config.version))
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
