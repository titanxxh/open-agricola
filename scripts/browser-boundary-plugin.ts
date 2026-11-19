import path from 'node:path'
import type { Plugin } from 'vite'
import type { DependencyEdge } from './check-dependencies'
import { browserRoots, isRuleRuntime, normalizePath, privilegedRoots } from './architecture-policy.mjs'

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
    if (!edge.typeOnly && ['client/local-sandbox/worker.ts', 'client/local-sandbox/card-tests.worker.ts'].includes(edge.to)) errors.push('worker must be loaded through its isolated Worker entry: ' + edge.from)
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

export function browserBoundaryPlugin(root: string, entryPoints: Readonly<Record<string, string>>): Plugin {
  const expectedEntries = new Set(Object.keys(entryPoints))
  return {
    name: 'architecture-browser-boundary',
    generateBundle() {
      const edges: DependencyEdge[] = []
      const relative = (id: string) => id.startsWith('\0') ? id : normalizePath(path.relative(root, id.split('?')[0]!))
      for (const id of this.getModuleIds()) {
        const info = this.getModuleInfo(id)
        if (!info) continue
        if (info.isEntry && !expectedEntries.has(relative(id))) this.error('unknown browser build entry: ' + relative(id))
        for (const target of [...info.importedIds, ...info.dynamicallyImportedIds]) {
          edges.push({ from: relative(id), to: relative(target), typeOnly: false, dynamic: info.dynamicallyImportedIds.includes(target) })
        }
      }
      const errors = browserBoundaryErrors(edges, Object.values(entryPoints))
      if (errors.length) this.error(errors.join('\n'))
    },
  }
}
