import path from 'node:path'
import { readFileSync } from 'node:fs'
import { build, type Plugin } from 'vite'

type OpaqueWorkerEntry = {
  /** Plugin and dev-route name; the dev route is `/@<name>.js`. */
  name: string
  /** Host module whose `new URL(...)` expression names the Worker. */
  host: string
  entry: string
  /** Asset file name emitted for production builds. */
  fileName: string
  /** HMR event that tells the host to drop its cached bundle. */
  event: string
  /** File name of this Worker in a prerelease prepared-workers directory. */
  prepared: string
}

export const OPAQUE_WORKER_ENTRIES: readonly OpaqueWorkerEntry[] = [
  { name: 'browser-card-tests-worker', host: 'client/local-sandbox/card-tests.ts', entry: 'client/local-sandbox/card-tests.worker.ts', fileName: 'card-tests.worker.js', event: 'browser-card-tests:invalidate', prepared: 'card-tests.js' },
  { name: 'local-sandbox-engine-worker', host: 'client/local-sandbox/opaque-worker.ts', entry: 'client/local-sandbox/worker.ts', fileName: 'local-sandbox.worker.js', event: 'local-sandbox-engine:invalidate', prepared: 'sandbox.js' },
]

function opaqueWorkerPlugin(spec: OpaqueWorkerEntry, preparedDirectory?: string): Plugin {
  const root = path.resolve(import.meta.dirname, '..')
  const host = path.join(root, spec.host)
  const entry = path.join(root, spec.entry)
  const workerExpression = `new URL('./${path.basename(spec.entry)}', import.meta.url).href`
  const devUrl = `/@${spec.name}.js`
  const runtimeEvent = spec.event
  let command: 'build' | 'serve'
  let base = '/'
  let cached: Promise<string> | undefined
  let dependencies = new Set<string>()
  const bundle = () => cached ??= build({
    root, configFile: false, logLevel: 'error',
    build: { write: false, minify: true, target: 'es2022',
      lib: { entry, name: spec.name.replace(/(^|-)(\w)/g, (_, _dash, letter: string) => letter.toUpperCase()), formats: ['iife'] } },
  }).then(result => {
    const outputs = Array.isArray(result) ? result : [result]
    const chunks = outputs.flatMap(output => 'output' in output ? output.output.filter(item => item.type === 'chunk') : [])
    const chunk = chunks[0]
    if (chunks.length !== 1 || !chunk || chunk.imports.length || chunk.dynamicImports.length) {
      throw new Error(`${spec.entry} requires one self-contained Worker bundle`)
    }
    dependencies = new Set(Object.keys(chunk.modules).map(file => path.resolve(file.split('?')[0]!)))
    return chunk.code
  }).catch(error => { cached = undefined; throw error })
  return {
    name: spec.name, enforce: 'pre',
    configResolved(config) { command = config.command; base = config.base },
    configureServer(server) {
      const invalidate = (file: string) => {
        if (!dependencies.has(path.resolve(file)) && (dependencies.size || !file.startsWith(root + path.sep))) return
        cached = undefined
        server.ws.send({ type: 'custom', event: runtimeEvent, data: {} })
      }
      server.watcher.on('change', invalidate)
      server.watcher.on('unlink', invalidate)
      server.httpServer?.once('close', () => {
        server.watcher.off('change', invalidate)
        server.watcher.off('unlink', invalidate)
      })
      server.middlewares.use(devUrl, (_request, response) => {
        void bundle().then(source => {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(source)
        }).catch(error => { response.statusCode = 500; response.end(String(error)) })
      })
    },
    async transform(source, id) {
      if (id.split('?')[0] !== host) return
      if (!source.includes(workerExpression)) this.error(`Missing ${spec.entry} Worker entry`)
      const url = command === 'serve' ? JSON.stringify(base.replace(/\/$/, '') + devUrl)
        : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: 'asset', name: spec.fileName,
          source: preparedDirectory ? readFileSync(path.join(preparedDirectory, spec.prepared)) : await bundle() })}`
      return { code: source.replace(workerExpression, url), map: null }
    },
  }
}

/**
 * Blob Workers in opaque frames cannot fetch an ESM graph, including in Vite dev.
 * A prerelease build may pass the directory where an earlier process emitted
 * these same Worker assets (`scripts/prerelease/prepare-frontend-worker.mjs`).
 */
export function browserCardTestsPlugin(preparedDirectory?: string): Plugin[] {
  return OPAQUE_WORKER_ENTRIES.map(spec => opaqueWorkerPlugin(spec, preparedDirectory))
}
