/** Ordinary TypeScript tests against the real engine inside an isolated browser Worker. */
import type { WorkshopBrowserTestOutcome } from '../../shared/contract/workshop.ts'
import { expect } from 'chai'
import ts from 'typescript'
import { GameCore } from '../../shared/session/session-core.ts'
import { createInitialState } from '../../shared/session/state-bootstrap.ts'
import { ensureCatalogLookupsInstalled } from '../../shared/cards/install-catalog-lookups.ts'
import type { CardDefinition } from '../../shared/contract/cards.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { emptyResources } from '../../shared/contract/state-constants.ts'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player.ts'
import { validateAndCompileCustomCodeLocal } from './browser-executor.ts'
import { registerBrowserBackedCustomCard } from './browser-runtime.ts'

export type BrowserCardTestRequest = {
  kind: 'run'
  id: string
  source: string
  tests: string
}
export type BrowserCardTestResult = { kind: 'result'; id: string; outcome: WorkshopBrowserTestOutcome }

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected card metadata object')
  return Object.fromEntries(Object.entries(value))
}

function parseCardDefinition(value: unknown, cardId: string): Pick<CustomCardData, 'cardType' | 'cardJson'> {
  const definition = object(value)
  if (definition.cardType !== 'minor' && definition.cardType !== 'occupation') throw new Error('Expected minor or occupation CARD_DEF')
  const meta = object(definition.meta)
  const { id, name, desc, prerequisite } = meta
  if (id !== cardId || typeof name !== 'string' || !Array.isArray(desc) || !desc.every((item): item is string => typeof item === 'string')) {
    throw new Error('CARD_DEF identity or required metadata is invalid')
  }
  let prerequisiteFields: Pick<CardDefinition, 'prerequisite' | 'occupationPrerequisites'> = {}
  if (typeof prerequisite === 'string') prerequisiteFields = { prerequisite }
  else if (prerequisite !== undefined) {
    const parsed = object(prerequisite)
    if (typeof parsed.occupation !== 'number' || !Number.isInteger(parsed.occupation) || parsed.occupation < 0) {
      throw new Error('Expected a string or occupation-count prerequisite')
    }
    prerequisiteFields = { prerequisite: `${parsed.occupation} Occupations`, occupationPrerequisites: { min: parsed.occupation } }
  }
  // Keep the actual authored metadata; optional rule values still use the
  // existing source admission and native consumers, as in the current sandbox.
  const cardJson: CardDefinition = { ...meta, id, name: name.trim(), deck: 'CUSTOM', number: 0, desc, implemented: true, ...prerequisiteFields }
  return { cardType: definition.cardType, cardJson }
}

function compileTests(source: string): string {
  const file = ts.createSourceFile('card.test.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node)
      || ts.isExportAssignment(node) || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      || (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))) {
      throw new Error('Tests use injected test, expect, createSession and helpers; imports/exports are unavailable')
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  const compiled = ts.transpileModule(source, {
    fileName: 'card.test.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  })
  const errors = compiled.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? []
  if (errors.length) throw new Error(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  return compiled.outputText
}

function scopedSession(core: GameCore): GameCore {
  return new Proxy(core, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      if (key === 'withCtx' || key === 'dispose') return value.bind(target)
      return (...args: unknown[]) => target.withCtx(() => Reflect.apply(value, target, args))
    },
  })
}

export async function runBrowserCardTestScript(request: BrowserCardTestRequest, onTestStart: (name: string) => void = () => {}): Promise<BrowserCardTestResult> {
  const tests: Array<{ name: string; ok: boolean; error?: string }> = []
  let outcome: WorkshopBrowserTestOutcome
  const warnings: string[] = []
  const sessions: GameCore[] = []
  const dispose = (from: number) => {
    for (const session of sessions.splice(from)) {
      warnings.push(...session.cardWarnings)
      session.dispose()
    }
  }
  try {
    const sourceFile = ts.createSourceFile('card.ts', request.source, ts.ScriptTarget.ES2022, true)
    const cardId = sourceFile.statements.flatMap(statement => ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name)
        && declaration.name.text === 'CARD_ID' && declaration.initializer && ts.isStringLiteralLike(declaration.initializer)
        ? [declaration.initializer.text] : []) : [])[0]
    if (!cardId) throw new Error('CARD_ID must be a top-level string literal')
    const compiled = validateAndCompileCustomCodeLocal(request.source, cardId)
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const card: CustomCardData = {
      ...parseCardDefinition(compiled.cardDefinition, cardId),
      effectCode: request.source, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest,
    }
    const createSession = () => {
      ensureCatalogLookupsInstalled()
      const state = createInitialState(42, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      }
      const core = new GameCore({
        stateOrSeed: state, customCards: [card], registerCustomCardImpl: registerBrowserBackedCustomCard,
      })
      sessions.push(core)
      const loaded = core.loadState(state)
      if (!loaded.ok || loaded.state.phase !== 'playing' || loaded.state.roundPhase !== 'work'
        || loaded.interaction.stateId !== 'idle') throw new Error('Failed to prepare a clean two-player work Session')
      return scopedSession(core)
    }
    const registered: Array<{ name: string; run: () => unknown }> = []
    const test = (name: unknown, run: unknown) => {
      if (typeof name !== 'string' || typeof run !== 'function') throw new Error('test requires a name and callback')
      registered.push({ name, run: () => run() })
    }
    const helpers = Object.freeze({ emptyResources: Object.freeze({ ...emptyResources }), setActiveWorkerCount, setWorkersAtHome })
    new Function('test', 'expect', 'createSession', 'helpers', `'use strict';\n${compileTests(request.tests)}`)(test, expect, createSession, helpers)
    if (!registered.length) throw new Error('No tests were registered')
    for (const entry of registered) {
      const start = sessions.length
      try {
        onTestStart(entry.name)
        await entry.run()
        tests.push({ name: entry.name, ok: true })
      } catch (error) { tests.push({ name: entry.name, ok: false, error: errorText(error) }) }
      finally { dispose(start) }
    }
    dispose(0)
    const failures = tests.flatMap(test => test.ok ? [] : [{ name: test.name, error: test.error ?? 'Test failed' }])
    failures.push(...warnings.map(error => ({ name: 'Card runtime', error })))
    outcome = failures.length ? { kind: 'failed', failures } : { kind: 'passed', count: tests.length }
  } catch (error) { outcome = { kind: 'error', message: errorText(error) } }
  finally { dispose(0) }
  return { kind: 'result', id: request.id, outcome }
}
