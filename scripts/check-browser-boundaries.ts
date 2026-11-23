import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { readDependencies } from './check-dependencies'
import { browserDataFiles } from './architecture-policy.mjs'
import { browserBoundaryErrors, browserBoundaryPlugin } from './browser-boundary-plugin'

export { browserBoundaryErrors, browserBoundaryPlugin } from './browser-boundary-plugin'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..')
  const graph = readDependencies(root)
  const errors = [...graph.errors, ...browserBoundaryErrors(graph.edges)]
  const targets = new Set(graph.edges.filter(edge => !edge.typeOnly).map(edge => edge.to))
  for (const file of browserDataFiles.keys()) {
    if (!targets.has(file)) errors.push('stale browser metadata permission: ' + file)
  }
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    const builds: { configFile: string; entryPoints: Record<string, string> }[] = [
      { configFile: 'vite.config.ts', entryPoints: { 'index.html': 'client/main.tsx', 'workshop-game.html': 'client/workshop-game/main.ts' } },
      { configFile: 'scripts/vite-encyclopedia.ts', entryPoints: { 'client/encyclopedia-static/index.html': 'client/encyclopedia-static/main.tsx' } },
      { configFile: 'replay-viewer/vite.config.ts', entryPoints: { 'replay-viewer/index.html': 'replay-viewer/src/main.tsx' } },
    ]
    for (const { configFile, entryPoints } of builds) {
      await build({
        configFile: path.join(root, configFile),
        plugins: [browserBoundaryPlugin(root, entryPoints)],
        build: { write: false },
      })
    }
    console.log('[check:browser-boundaries] all production entry closures are rule-runtime free')
  }
}
