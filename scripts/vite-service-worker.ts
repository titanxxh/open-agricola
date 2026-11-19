import path from 'node:path'
import { readFileSync } from 'node:fs'
import { build, type Plugin } from 'vite'
import { parseLanguageManifest, parseLanguagePack } from '../shared/i18n/index.ts'
import { browserBoundaryPlugin } from './browser-boundary-plugin.ts'
import { buildOfflineEncyclopedia } from './card-encyclopedia/offline-artifacts.ts'
import type { PublicAssetConfig } from './public-assets.ts'

export const PUBLIC_ASSET_CACHE_ENABLED = true
export const ROOM_OFFLINE_RETRY_ENABLED = true
export const OFFLINE_ENCYCLOPEDIA_ENABLED = true
export const SERVICE_WORKER_EMERGENCY_TAKEOVER = false

const root = path.resolve(import.meta.dirname, '..')
const fileName = 'sw.js'
const virtualEntry = 'virtual:open-agricola-service-worker'
const virtualId = `\0${virtualEntry}`

type WorkerFeatures = {
  assets: boolean
  roomOffline: boolean
  offlineEncyclopedia: boolean
  emergencyTakeover: boolean
}
type AssetWorkerConfig = Pick<PublicAssetConfig, 'baseUrl' | 'digests'>

function roomOfflineCopy(locale: 'en' | 'zh') {
  const directory = path.join(root, 'public/i18n')
  const manifest = parseLanguageManifest(JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')))
  const entry = manifest.languages.find(language => language.id === locale)
  if (!entry || !/^[a-z0-9.-]+\.json$/.test(entry.file)) throw new Error(`Missing Worker language pack: ${locale}`)
  const pack = parseLanguagePack(JSON.parse(readFileSync(path.join(directory, entry.file), 'utf8')))
  if (pack.locale !== locale) throw new Error(`Worker language pack identity mismatch: ${locale}`)
  const message = (key: string) => {
    const value = pack.messages[key]
    if (!value) throw new Error(`Missing Worker translation ${key} for ${locale}`)
    return value
  }
  return { message: message('ui.roomOfflineMessage'), retry: message('platform.retry') }
}

export function serviceWorkerPlugin(config: PublicAssetConfig): Plugin {
  return {
    name: 'main-site-service-worker',
    apply: 'build',
    async buildStart() {
      let encyclopediaFallback = ''
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

      const source = await buildServiceWorker(config, encyclopediaFallback, {
        assets: PUBLIC_ASSET_CACHE_ENABLED,
        roomOffline: ROOM_OFFLINE_RETRY_ENABLED,
        offlineEncyclopedia: OFFLINE_ENCYCLOPEDIA_ENABLED,
        emergencyTakeover: SERVICE_WORKER_EMERGENCY_TAKEOVER,
      })
      this.emitFile({ type: 'asset', fileName, source })
    },
  }
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
  if (features.roomOffline) {
    add('installRoomOffline', 'service-worker/room-offline.worker.ts', { en: roomOfflineCopy('en'), zh: roomOfflineCopy('zh') })
  }
  if (features.offlineEncyclopedia) {
    add('installOfflineEncyclopedia', 'service-worker/offline-encyclopedia.worker.ts', encyclopediaFallback)
  }
  add('installWebPush', 'service-worker/web-push.worker.ts')
  if (features.emergencyTakeover) {
    install.push('self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));')
  }
  return [...imports, ...install].join('\n')
}
