// Production entry preload: Node strips TypeScript natively; this hook only
// resolves the repository's extensionless relative imports to `.ts` files.
import { registerHooks } from 'node:module'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const marker = Symbol.for('open-agricola.typescript-runtime')
const explicitExtension = /\.(?:[cm]?[jt]sx?|json|node|wasm)$/
const isFile = url => {
  try { return statSync(fileURLToPath(url)).isFile() } catch { return false }
}

if (!globalThis[marker]) {
  globalThis[marker] = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')
        && !explicitExtension.test(specifier)) {
        for (const suffix of ['.ts', '/index.ts']) {
          const candidate = new URL(specifier + suffix, context.parentURL)
          if (isFile(candidate)) return nextResolve(candidate.href, context)
        }
      }
      return nextResolve(specifier, context)
    },
  })
}
