import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { build, type Plugin, type Rolldown } from 'vite'
import { parseLanguageManifest, parseLanguagePack } from '../shared/i18n/index.ts'
import { browserBoundaryPlugin } from './browser-boundary-plugin.ts'
import { buildOfflineEncyclopedia } from './card-encyclopedia/offline-artifacts.ts'
import type { PublicAssetConfig } from './public-assets.ts'

export const PUBLIC_ASSET_CACHE_ENABLED = true
export const APP_SHELL_CACHE_ENABLED = true
export const ROOM_OFFLINE_RETRY_ENABLED = true
export const OFFLINE_ENCYCLOPEDIA_ENABLED = true
export const SERVICE_WORKER_EMERGENCY_TAKEOVER = false

const root = path.resolve(import.meta.dirname, '..')
const fileName = 'sw.js'
const virtualEntry = 'virtual:open-agricola-service-worker'
const virtualId = `\0${virtualEntry}`

type WorkerFeatures = {
  assets: boolean
  /** This build's content-addressed files with their SHA-256 and background warm set; omitted to leave them to the HTTP cache. */
  appShell?: Readonly<{ digests: Readonly<Record<string, string>>; warm: readonly string[] }>
  roomOffline: boolean
  offlineEncyclopedia: boolean
  emergencyTakeover: boolean
}
type AssetWorkerConfig = Pick<PublicAssetConfig, 'baseUrl' | 'digests'>

function roomOfflineCopy(locale: 'en' | 'zh') {
  const directory = path.join(root, 'public/i18n')
  const manifest = parseLanguageManifest(JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')))
  const entry = manifest.languages.find(language => language.id === locale)
  if (!entry || !/^[a-z0-9.-]+\.json$/.test(entry.core.file)) throw new Error(`Missing Worker language pack: ${locale}`)
  const pack = parseLanguagePack(JSON.parse(readFileSync(path.join(directory, entry.core.file), 'utf8')))
  if (pack.locale !== locale) throw new Error(`Worker language pack identity mismatch: ${locale}`)
  const message = (key: string) => {
    const value = pack.messages[key]
    if (!value) throw new Error(`Missing Worker translation ${key} for ${locale}`)
    return value
  }
  return { message: message('ui.roomOfflineMessage'), retry: message('platform.retry') }
}

export function serviceWorkerPlugin(config: PublicAssetConfig): Plugin {
  let encyclopediaFallback = ''
  return {
    name: 'main-site-service-worker',
    apply: 'build',
    enforce: 'post',
    async buildStart() {
      encyclopediaFallback = ''
      if (OFFLINE_ENCYCLOPEDIA_ENABLED) {
        const { packs } = buildOfflineEncyclopedia(root)
        const directory = path.join(root, 'output/offline-encyclopedia')
        const fallback = readFileSync(path.join(directory, 'index.html'))
        encyclopediaFallback = fallback.toString('utf8')
        this.emitFile({ type: 'asset', fileName: 'offline-encyclopedia/index.html', source: fallback })
        for (const name of ['manifest.json', ...packs.map(pack => pack.file)]) {
          const source = readFileSync(path.join(directory, name))
          this.emitFile({ type: 'asset', fileName: `offline-encyclopedia/${name}`, source })
        }
      }
    },
    // The Worker lists the finished bundle's hashed files, so it is built after every plugin has rewritten them.
    generateBundle: { order: 'post', async handler(_options, bundle) {
      const source = await buildServiceWorker(config, encyclopediaFallback, {
        assets: PUBLIC_ASSET_CACHE_ENABLED,
        appShell: APP_SHELL_CACHE_ENABLED
          ? { digests: appShellDigests(bundle, path.join(root, 'public')), warm: screenFiles(bundle, 'client/app/GameContainerApi.tsx') }
          : undefined,
        roomOffline: ROOM_OFFLINE_RETRY_ENABLED,
        offlineEncyclopedia: OFFLINE_ENCYCLOPEDIA_ENABLED,
        emergencyTakeover: SERVICE_WORKER_EMERGENCY_TAKEOVER,
      })
      this.emitFile({ type: 'asset', fileName, source })
    } },
  }
}

const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/**
 * Bundled `assets/*` files carry a content hash in their names, and so do the published language packs and the
 * cards manifest copied from `public/`. Unhashed public files (`i18n/manifest.json`, `cards-manifest.json`) are
 * left out because their bytes change under the same name.
 */
/** The chunk whose entry module is `entry`, with every chunk and stylesheet it loads, as site-relative paths. */
export function screenFiles(bundle: Rolldown.OutputBundle, entry: string): string[] {
  const chunks = new Map<string, Rolldown.OutputChunk>()
  for (const output of Object.values(bundle)) if (output.type === 'chunk') chunks.set(output.fileName, output)
  const start = [...chunks.values()].find(chunk => chunk.facadeModuleId?.split(path.sep).join('/').endsWith(entry))
  if (!start) throw new Error(`The Pages Worker cannot find the ${entry} chunk to warm`)
  const files = new Set<string>()
  const visit = (chunk: Rolldown.OutputChunk) => {
    if (files.has(chunk.fileName)) return
    files.add(chunk.fileName)
    const css = (chunk as Rolldown.OutputChunk & { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss
    for (const file of css ?? []) files.add(file)
    for (const name of chunk.imports) { const next = chunks.get(name); if (next) visit(next) }
  }
  visit(start)
  return [...files].sort()
}

export function appShellDigests(bundle: Rolldown.OutputBundle, publicDir: string): Record<string, string> {
  const digests: Record<string, string> = {}
  for (const output of Object.values(bundle)) {
    if (!output.fileName.startsWith('assets/')) continue
    digests[output.fileName] = sha256(output.type === 'chunk' ? output.code : output.source)
  }
  const add = (relative: string) => { digests[relative] = sha256(readFileSync(path.join(publicDir, relative))) }
  for (const name of readdirSync(path.join(publicDir, 'i18n'))) {
    if (/^[a-z0-9-]+\.[a-f0-9]{16}\.json$/.test(name)) add(`i18n/${name}`)
  }
  for (const name of readdirSync(publicDir)) {
    if (/^cards-manifest\.[a-f0-9]{64}\.json$/.test(name)) add(name)
  }
  return digests
}

export async function buildServiceWorker(config: AssetWorkerConfig, encyclopediaFallback: string, features: WorkerFeatures) {
  if (features.assets && !config.digests) throw new Error('The Pages asset Worker requires verified public asset digests')
  // The app and Worker can share source files, but an installed Worker must not load app chunks.
  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [
      {
        name: 'open-agricola-service-worker-entry',
        resolveId: id => id === virtualEntry ? virtualId : undefined,
        load: id => id === virtualId ? workerSource(config, encyclopediaFallback, features) : undefined,
      },
      browserBoundaryPlugin(root, { [virtualId]: virtualId }),
    ],
    build: {
      write: false,
      rolldownOptions: {
        input: virtualEntry,
        output: { format: 'iife', codeSplitting: false, entryFileNames: fileName },
      },
    },
  })
  const outputs = 'output' in result ? result.output : []
  const [worker] = outputs
  if (outputs.length !== 1 || !worker || worker.type !== 'chunk'
    || worker.imports.length || worker.dynamicImports.length || worker.exports.length) {
    throw new Error('The Pages Worker must be a self-contained classic script at /sw.js')
  }
  return worker.code
}

function workerSource(config: AssetWorkerConfig, encyclopediaFallback: string, features: WorkerFeatures) {
  const imports: string[] = []
  const install: string[] = []
  const add = (installer: string, module: string, data?: unknown) => {
    imports.push(`import { ${installer} } from ${JSON.stringify(path.join(root, 'client', module))};`)
    const argument = data === undefined ? '' : `, ${JSON.stringify(data)}`
    install.push(`${installer}(self${argument});`)
  }
  if (features.assets) {
    const { baseUrl, digests } = config
    add('installPublicAssetWorker', 'public-assets/cache.worker.ts', { baseUrl, digests })
  }
  if (features.appShell) {
    add('installAppShellCache', 'service-worker/app-shell.worker.ts', features.appShell)
  }
  if (features.roomOffline) {
    add('installRoomOffline', 'service-worker/room-offline.worker.ts', { en: roomOfflineCopy('en'), zh: roomOfflineCopy('zh') })
  }
  if (features.offlineEncyclopedia) {
    add('installOfflineEncyclopedia', 'service-worker/offline-encyclopedia.worker.ts', encyclopediaFallback)
  }
  add('installWebPush', 'service-worker/web-push.worker.ts')
  add('installWorkerCapabilities', 'service-worker/capabilities.ts', { offlineEncyclopedia: features.offlineEncyclopedia, webPush: true })
  if (features.emergencyTakeover) {
    install.push('self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));')
  }
  return [...imports, ...install].join('\n')
}
