import path from 'node:path'
import type { Plugin } from 'vite'
import type { PublicAssetConfig } from './public-assets.ts'

export const PUBLIC_ASSET_CACHE_ENABLED = true
export const publicAssetWorkerPassThroughSource = 'self.addEventListener("install", event => event.waitUntil(self.skipWaiting()))\n'

const fileName = 'sw.js'
const virtualEntry = 'virtual:open-agricola-public-asset-worker'
const virtualId = `\0${virtualEntry}`
const runtime = path.resolve(import.meta.dirname, '../client/public-assets/cache.worker.ts')

export function publicAssetWorkerPlugin(config: PublicAssetConfig): Plugin {
  return {
    name: 'public-asset-worker',
    apply: 'build',
    buildStart() {
      if (!PUBLIC_ASSET_CACHE_ENABLED) {
        this.emitFile({ type: 'asset', fileName, source: publicAssetWorkerPassThroughSource })
        return
      }
      if (!config.digests) this.error('The Pages asset Worker requires verified public asset digests')
      this.emitFile({ type: 'chunk', id: virtualEntry, fileName })
    },
    resolveId(id) {
      if (id === virtualEntry) return virtualId
    },
    load(id) {
      if (id !== virtualId) return
      const { baseUrl, digests } = config
      return `import { installPublicAssetWorker } from ${JSON.stringify(runtime)};\n`
        + `installPublicAssetWorker(self, ${JSON.stringify({ baseUrl, digests })});\n`
    },
    generateBundle(_options, bundle) {
      if (!PUBLIC_ASSET_CACHE_ENABLED) return
      const output = bundle[fileName]
      if (
        !output || output.type !== 'chunk' || output.imports.length || output.dynamicImports.length || output.exports.length
        || Object.keys(output.modules).some(id => id !== virtualId && id !== runtime)
      ) {
        this.error('The Pages asset Worker must be a self-contained classic script at /sw.js')
      }
    },
  }
}
