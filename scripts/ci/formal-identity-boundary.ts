import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { IDENTITY_BOUNDARY_PATHS } from '../prerelease/identity-boundary-paths.ts'
import { fullSha } from './verification-tasks.ts'

// The HTTP, WS and page routers wire the identity modules into a large application. Bind the wiring itself;
// traverse the identity modules below, so unrelated game handlers and page implementations can ship independently.
const wiring = [
  'server/index.ts', 'server/connection/ws-server.ts', 'client/main.tsx', 'client/App.tsx', 'client/app/PageRouter.tsx',
  'Dockerfile', 'docker-compose.prod.yml', 'docker-compose.yml', 'deploy-backend.sh', 'deploy/Caddyfile.example',
  'pnpm-lock.yaml', '.npmrc', 'vite.config.ts', 'tsconfig.app.json', 'tsconfig.server.json',
]
const modules = [...IDENTITY_BOUNDARY_PATHS, 'server/formal-identity-boundary.ts', 'client/app/PrereleaseEntry.tsx',
  'client/app/BetaAccessSettings.tsx', 'client/contexts/AuthContext.tsx', 'server/storage/erasure-ledger.ts',
  ':(glob)server/oauth/*.ts', ':(glob)server/database/*.sql']
const extensions = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js']

export function formalIdentityBoundary(cwd: string, sourceSha: string): string {
  fullSha(sourceSha)
  const git = (args: string[]) => execFileSync('git', ['--no-replace-objects', ...args], { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const entries = new Map(git(['ls-tree', '-rz', '--full-tree', sourceSha]).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t')
    return [entry.slice(tab + 1), entry.slice(0, tab)]
  }))
  const files = new Set(wiring.filter(path => entries.has(path)))
  const paths = new Set(modules.filter(path => entries.has(path)))
  const globs = modules.filter(path => path.startsWith(':(glob)')).map(path => path.slice(7))
  for (const path of entries.keys()) if (globs.some(pattern => posix.matchesGlob(path, pattern))) paths.add(path)
  const hash = createHash('sha256').update('oa-formal-identity-boundary-v2\0')
  const unclassified = () => hash.update('unclassified\0').update(sourceSha).digest('hex')
  for (const path of paths) {
    files.add(path)
    if (!entries.get(path)?.startsWith('100')) return unclassified()
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue
    const code = git(['cat-file', 'blob', `${sourceSha}:${path}`])
      .replace(/^\s*(?:import|export)\s+type\s+(?:\{[^{}]*\}|\w+)\s+from\s*['"][^'"\n]+['"]/gm, '')
    // Every quoted relative path counts, including re-exports, side effects and literal dynamic imports.
    // A computed module name or alias cannot prove an unchanged closure for a later build.
    for (const call of code.matchAll(/\b(?:require|import)(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*\(/g)) {
      if (!/^\s*['"][^'"\\\n]+['"]\s*\)/.test(code.slice(call.index + call[0].length))) return unclassified()
    }
    if (/\b(?:import\s*\.\s*meta\s*\.\s*(?:glob|resolve)|require\s*\.\s*resolve|createRequire)\b/.test(code)
      || /['"]\.{1,2}\/[^'"\n]*\\/.test(code)) return unclassified()
    for (const match of code.matchAll(/['"]((?:\.\.?\/)[^'"\n\\]+)['"]/g)) {
      const relative = posix.join(posix.dirname(path), match[1])
      for (const extension of extensions) {
        const candidate = relative + extension
        if (entries.has(candidate)) paths.add(candidate)
      }
    }
    if (/(?:\bfrom\s*|\bimport\s*|\b(?:require|import)\s*\(\s*)['"](?:[@~]\/|#)/.test(code)) return unclassified()
  }
  for (const path of [...files].sort()) {
    const entry = entries.get(path)
    if (!entry?.startsWith('100')) return unclassified()
    hash.update(path).update('\0').update(entry).update('\0')
  }
  if (entries.has('package.json')) {
    const manifest = JSON.parse(git(['cat-file', 'blob', `${sourceSha}:package.json`]))
    delete manifest.version
    hash.update('package.json\0').update(JSON.stringify(manifest)).update('\0')
  }
  return hash.digest('hex')
}
