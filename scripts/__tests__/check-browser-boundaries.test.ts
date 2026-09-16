import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { browserBoundaryErrors, browserBoundaryPlugin } from '../check-browser-boundaries'
import { readDependencies, type DependencyEdge } from '../check-dependencies'

const edge = (from: string, to: string, dynamic = false): DependencyEdge => ({ from, to, dynamic, typeOnly: false })

describe('browser entry closures', () => {
  it('follows virtual modules in the actual Vite graph', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-virtual-'))
    try {
      const files = {
        'index.html': '<script type="module" src="/client/main.tsx"></script>',
        'client/main.tsx': "import { rule } from 'generated-display'; globalThis.probe = rule",
        'shared/engine/probe.js': 'export const rule = 42',
        'node_modules/generated-display/package.json': '{"name":"generated-display","main":"index.js"}',
        'node_modules/generated-display/index.js': 'export const rule = 0',
      }
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
        fs.writeFileSync(path.join(root, file), content)
      }
      expect(readDependencies(root, ['client', 'shared']).errors).toEqual([])
      await expect(build({
        root, configFile: false, logLevel: 'silent', build: { write: false },
        plugins: [{
          name: 'generated-display-fixture', enforce: 'pre',
          resolveId(id) { if (id === 'generated-display') return '\0generated-display' },
          load(id) { if (id === '\0generated-display') return 'export { rule } from ' + JSON.stringify(path.join(root, 'shared/engine/probe.js')) },
        }, browserBoundaryPlugin(root, 'client/main.tsx')],
      })).rejects.toThrow('shared/engine/probe.js')
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('rejects rule imports hidden behind pure-looking helpers or dynamic chunks', () => {
    const edges = [
      edge('client/main.tsx', 'shared/domain/display.ts'),
      edge('shared/domain/display.ts', 'shared/cards/card-effects.ts', true),
    ]
    expect(browserBoundaryErrors(edges, ['client/main.tsx'])).toEqual([
      'client/main.tsx -> shared/domain/display.ts -> shared/cards/card-effects.ts',
    ])
  })

  it('allows the exact sandbox entry but still checks other callers of its dependencies', () => {
    const edges = [
      edge('client/main.tsx', 'client/sandbox/index.tsx'),
      edge('client/sandbox/index.tsx', 'client/sandbox/SandboxApp.tsx', true),
      edge('client/sandbox/SandboxApp.tsx', 'shared/engine/index.ts'),
    ]
    expect(browserBoundaryErrors(edges, ['client/main.tsx'])).toEqual([])
    expect(browserBoundaryErrors([...edges, edge('client/main.tsx', 'shared/engine/index.ts')], ['client/main.tsx'])).not.toEqual([])
    expect(browserBoundaryErrors([edge('client/main.tsx', 'client/sandbox/SandboxApp.tsx')], ['client/main.tsx'])).not.toEqual([])
  })

  it('fails without entry evidence and rejects direct loading of the worker into the UI', () => {
    expect(browserBoundaryErrors([], ['client/main.tsx'])).toEqual(['missing browser entry evidence: client/main.tsx'])
    expect(browserBoundaryErrors([edge('client/main.tsx', 'client/local-sandbox/worker.ts')], ['client/main.tsx'])).not.toEqual([])
  })
})
