import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'vite'
import { readDependencies, type DependencyEdge } from './check-dependencies'
import { browserRoots, isRuleRuntime, normalizePath, privilegedRoots, browserDataFiles } from './architecture-policy.mjs'

export function browserBoundaryErrors(
  edges: readonly DependencyEdge[],
  roots: readonly string[] = browserRoots,
): string[] {
  const graph = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.typeOnly) continue
    graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to])
  }
  const errors: string[] = []
  for (const edge of edges) {
    if (!edge.typeOnly && edge.to === 'client/sandbox/SandboxApp.tsx' && (edge.from !== 'client/sandbox/index.tsx' || !edge.dynamic)) errors.push('unauthorized sandbox entry: ' + edge.from)
    if (!edge.typeOnly && edge.to === 'client/local-sandbox/worker.ts') errors.push('worker must be loaded through its isolated Worker entry: ' + edge.from)
  }
  for (const root of roots) {
    if (!graph.has(root)) {
      errors.push(`missing browser entry evidence: ${root}`)
      continue
    }
    const seen = new Set<string>()
    const visit = (file: string, trail: string[]): void => {
      if (seen.has(file)) return
      seen.add(file)
      if (privilegedRoots.has(file)) return
      if (isRuleRuntime(file)) {
        errors.push([...trail, file].join(' -> '))
        return
      }
      for (const target of graph.get(file) ?? []) visit(target, [...trail, file])
    }
    visit(root, [])
  }
  return errors
}

export function browserBoundaryPlugin(root: string, entry: string): Plugin {
  return {
    name: 'architecture-browser-boundary',
    generateBundle() {
      const edges: DependencyEdge[] = []
      const relative = (id: string) => id.startsWith('\0') ? id : normalizePath(path.relative(root, id.split('?')[0]!))
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id)
        if (!info) continue
        const expectedEntry = entry === 'client/main.tsx' ? 'index.html' : 'replay-viewer/index.html'
        if (info.isEntry && relative(id) !== expectedEntry) this.error('unknown browser build entry: ' + relative(id))
        for (const target of [...info.importedIds, ...info.dynamicallyImportedIds]) {
          edges.push({ from: relative(id), to: relative(target), typeOnly: false, dynamic: info.dynamicallyImportedIds.includes(target) })
        }
      }
      const errors = browserBoundaryErrors(edges, [entry])
      if (errors.length) this.error(errors.join('\n'))
    },
  }
}

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
    for (const [entry, configFile] of [
      ['client/main.tsx', 'vite.config.ts'],
      ['replay-viewer/src/main.tsx', 'replay-viewer/vite.config.ts'],
    ]) {
      await build({
        configFile: path.join(root, configFile!),
        plugins: [browserBoundaryPlugin(root, entry!)],
        build: { write: false },
      })
    }
    console.log('[check:browser-boundaries] both production entry closures are rule-runtime free')
  }
}
