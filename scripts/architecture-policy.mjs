import path from 'node:path'
import { builtinModules } from 'node:module'
import ts from 'typescript'

export const browserRoots = ['client/main.tsx', 'replay-viewer/src/main.tsx']
export const privilegedRoots = new Map([
  ['client/sandbox/SandboxApp.tsx', 'Workshop authoring sandbox entry'],
  ['client/local-sandbox/worker.ts', 'Isolated local game worker entry'],
])
export const workerFiles = new Set([
  'client/local-sandbox/worker.ts',
  'client/local-sandbox/worker-core.ts',
  'client/local-sandbox/browser-runtime.ts',
  'client/local-sandbox/browser-executor.ts',
])
const nodeModules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
export const isTestFile = file => /(?:^|\/)(?:__tests__|fixtures)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
export const isSourceFile = file => /\.[cm]?[jt]sx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file)
export const normalizePath = file => file.split(path.sep).join('/')
export const resolveImport = (specifier, file) => ts.resolveModuleName(specifier, file, {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  resolveJsonModule: true,
}, ts.sys).resolvedModule?.resolvedFileName

export const browserDataFiles = new Map([
  ['shared/parents/index.ts', 'Declarative parent card display metadata'],
  ['shared/parents/ids.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR01.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR02.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR03.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR04.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR05.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR06.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR07.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR08.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR09.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR10.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR11.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PR12.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS01.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS02.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS03.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS04.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS05.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS06.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS07.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS08.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS09.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS10.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS11.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/PS12.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/fathers.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/index.ts', 'Declarative parent card display metadata'],
  ['shared/parents/cards/mothers.ts', 'Declarative parent card display metadata'],
])

export const isRuleRuntime = file => !browserDataFiles.has(file) && (
  /^shared\/(?:session|engine|actions|parents|seasons|moor)\//.test(file)
  || /^shared\/cards\/(?:[A-E]|M|major|community|__stubs__)\//.test(file)
  || /^shared\/cards\/(?:catalog|install-catalog-lookups|register-all|custom-registry|registry-runtime|card-effects|card-modifiers|player-action-space)(?:\.[cm]?[jt]s)?$/.test(file))

export function importViolation(from, to, specifier, typeOnly = false) {
  if (isTestFile(from)) return null
  const layer = from.split('/')[0]
  if (layer === 'shared' && /^(?:server|client|replay-viewer)\//.test(to)) return 'shared cannot depend on server or browser code'
  if (layer === 'server' && /^(?:client|replay-viewer)\//.test(to)) return 'server cannot depend on browser code'
  if ((layer === 'client' || layer === 'replay-viewer') && to.startsWith('server/')) return 'browser cannot depend on server code'
  if (/^shared\/(?:cards|actions\/effects)\//.test(from) && /(?:^|\/)helpers\/(?:payment|pay-helpers|room-payment)(?:\.[cm]?[jt]s)?$/.test(to)) return 'use the PaymentSolver namespace'
  if (from.startsWith('shared/domain/')) {
    if (nodeModules.has(specifier) || specifier.startsWith('node:')) return 'domain cannot depend on Node APIs'
    if (/^react(?:-dom)?(?:\/|$)/.test(specifier)) return 'domain cannot depend on React'
    if (/^shared\/(?:engine|session|actions\/effects)\//.test(to)) return 'domain cannot depend on engine, session, or effects'
  }
  if (typeOnly) return null
  if (from.startsWith('shared/contract/') && to.startsWith('shared/') && !to.startsWith('shared/contract/')) return 'contract cannot depend on runtime modules'
  if (from.startsWith('shared/utils/') && /^(?:server|client|replay-viewer)\/|^shared\/(?!utils\/|contract\/)/.test(to)) return 'utils cannot depend on domain or runtime modules'
  if ((layer === 'client' || layer === 'replay-viewer') && !workerFiles.has(from) && isRuleRuntime(to)) return 'browser UI cannot depend on rule runtime modules'
  return null
}

export const architectureImportRule = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{message}}' } },
  create(context) {
    const from = normalizePath(path.relative(context.cwd, context.filename))
    const check = (node, source, typeOnly = false) => {
      if (typeof source?.value !== 'string') return
      const resolved = resolveImport(source.value, context.filename)
      const to = resolved ? normalizePath(path.relative(context.cwd, resolved)) : source.value.startsWith('.') ? normalizePath(path.relative(context.cwd, path.resolve(path.dirname(context.filename), source.value))) : source.value
      const message = importViolation(from, to, source.value, typeOnly)
      if (message) context.report({ node, messageId: 'boundary', data: { message } })
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source, node.importKind === 'type')
      },
      ExportNamedDeclaration(node) {
        check(node, node.source, node.exportKind === 'type')
      },
      ExportAllDeclaration(node) { check(node, node.source, node.exportKind === 'type') },
      ImportExpression(node) { check(node, node.source) },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, node.arguments[0])
      },
    }
  },
}
