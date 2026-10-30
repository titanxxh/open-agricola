import path from 'node:path'
import { build, type Plugin } from 'vite'

const runtimeEvent = 'browser-card-tests:invalidate'
const workerExpression = "new URL('./card-tests.worker.ts', import.meta.url).href"

/** Blob Workers in opaque frames cannot fetch an ESM graph, including in Vite dev. */
export function browserCardTestsPlugin(): Plugin {
  const root = path.resolve(import.meta.dirname, '..')
  const host = path.join(root, 'client/local-sandbox/card-tests.ts')
  const entry = path.join(root, 'client/local-sandbox/card-tests.worker.ts')
  const devUrl = '/@browser-card-tests-worker.js'
  let command: 'build' | 'serve'
  let base = '/'
  let cached: Promise<string> | undefined
  let dependencies = new Set<string>()
  const bundle = () => cached ??= build({
    root, configFile: false, logLevel: 'error',
    build: { write: false, minify: true, target: 'es2022',
      lib: { entry, name: 'BrowserCardTests', formats: ['iife'] } },
  }).then(result => {
    const outputs = Array.isArray(result) ? result : [result]
    const chunks = outputs.flatMap(output => 'output' in output ? output.output.filter(item => item.type === 'chunk') : [])
    const chunk = chunks[0]
    if (chunks.length !== 1 || !chunk || chunk.imports.length || chunk.dynamicImports.length) {
      throw new Error('Browser card tests require one self-contained Worker bundle')
    }
    dependencies = new Set(Object.keys(chunk.modules).map(file => path.resolve(file.split('?')[0]!)))
    return chunk.code
  }).catch(error => { cached = undefined; throw error })
  return {
    name: 'browser-card-tests-worker', enforce: 'pre',
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
      if (!source.includes(workerExpression)) this.error('Missing browser card test Worker entry')
      const url = command === 'serve' ? JSON.stringify(base.replace(/\/$/, '') + devUrl)
        : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: 'asset', name: 'card-tests.worker.js', source: await bundle() })}`
      return { code: source.replace(workerExpression, url), map: null }
    },
  }
}
