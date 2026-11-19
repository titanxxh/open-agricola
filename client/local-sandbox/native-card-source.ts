/**
 * Loads a Workshop card written as a native Card Source module (ADR 0052).
 *
 * The source is the file its pull request adds at
 * `shared/cards/community/<CARD_ID>.ts`. Its relative imports resolve to the
 * Worker's own engine modules, so the card shares the native objects and
 * semantics of built-in cards. Only the opaque browser Worker runs this code.
 */
import ts from 'typescript'
import type { CardImpl } from '../../shared/cards/registry.ts'
import type { CardDefinition } from '../../shared/contract/cards.ts'

const SOURCE_DIRECTORY = 'shared/cards/community'

// The engine modules and card helpers a card may import, mirroring card-source-admission.ts;
// another card's file is not importable. The Worker already bundles the engine they belong to.
const MODULES = import.meta.glob([
  '../../shared/{actions,contract,domain,engine,events,moor,parents,seasons,session,utils}/**/*.ts', '../../shared/cards/*.ts', '../../shared/cards/{helpers,action}/**/*.ts',
  '!../../shared/**/__tests__/**', '!../../shared/**/__stubs__/**', '!../../shared/**/__fixtures__/**', '!../../shared/**/fixtures/**', '!../../shared/**/*.d.ts',
], { eager: true }) as Record<string, Record<string, unknown>>
const byPath = new Map(Object.entries(MODULES).map(([key, module]) => [key.replace(/^(\.\.\/)+/, ''), module]))

export type NativeCardSource = {
  cardType: 'minor' | 'occupation'
  meta: CardDefinition
  impl: CardImpl
}

const normalize = (path: string): string => {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) throw new Error(`Import escapes the repository: ${path}`); parts.pop() } else parts.push(part)
  }
  return parts.join('/')
}

/** Resolves a relative import written from `shared/cards/community/` to a bundled module. */
export function resolveCardImport(specifier: string): Record<string, unknown> {
  if (!specifier.startsWith('.')) throw new Error(`Card imports must be relative paths inside shared/: ${specifier}`)
  const base = normalize(`${SOURCE_DIRECTORY}/${specifier}`).replace(/\.(?:ts|js)$/, '')
  const module = byPath.get(`${base}.ts`) ?? byPath.get(`${base}/index.ts`)
  if (!module) throw new Error(`Card import is not an available shared module: ${specifier}`)
  return module
}

// A card module may register module-level hooks, so each source is evaluated once.
const loaded = new Map<string, NativeCardSource>()

/** Compiles and evaluates the module, returning its single exported card definition. */
export function loadNativeCardSource(source: string, cardId: string): NativeCardSource {
  const key = `${cardId}\n${source}`
  const cached = loaded.get(key)
  if (cached) return cached
  const compiled = ts.transpileModule(source, {
    fileName: `${SOURCE_DIRECTORY}/${cardId}.ts`, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  })
  const errors = compiled.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? []
  if (errors.length) throw new Error(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  const module = { exports: {} as Record<string, unknown> }
  new Function('exports', 'require', 'module', compiled.outputText)(module.exports, resolveCardImport, module)
  const card = module.exports[cardId] as { meta?: unknown; impl?: unknown; kind?: unknown } | undefined
  if (!card || typeof card !== 'object') throw new Error(`The module must export const ${cardId} = defineMinorCard(...) or defineOccupationCard(...)`)
  if (card.kind !== 'minor' && card.kind !== 'occupation') throw new Error(`${cardId} must be a minor improvement or an occupation`)
  const meta = card.meta as CardDefinition | undefined
  if (!meta || meta.id !== cardId) throw new Error(`${cardId}.meta.id must be '${cardId}'`)
  const result: NativeCardSource = { cardType: card.kind, meta, impl: (card.impl ?? {}) as CardImpl }
  loaded.set(key, result)
  return result
}
