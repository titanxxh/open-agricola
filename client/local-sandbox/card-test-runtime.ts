/** Ordinary TypeScript tests against the real engine inside an isolated browser Worker. */
import type { WorkshopBrowserTestOutcome } from '../../shared/contract/workshop.ts'
import { expect } from 'chai'
import ts from 'typescript'
import { GameCore } from '../../shared/session/session-core.ts'
import { createInitialState } from '../../shared/session/state-bootstrap.ts'
import { ensureCatalogLookupsInstalled } from '../../shared/cards/install-catalog-lookups.ts'
import { emptyResources } from '../../shared/contract/state-constants.ts'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player.ts'
import { prepareLocalCustomCard, registerLocalCustomCard } from './local-custom-card.ts'
import { isNativeCardSource, LEGACY_CARD_SOURCE_MESSAGE, nativeCardId } from '../../shared/custom-code/card-source-admission.ts'

export type BrowserCardTestRequest = {
  kind: 'run'
  id: string
  source: string
  tests: string
}
export type BrowserCardTestResult = { kind: 'result'; id: string; outcome: WorkshopBrowserTestOutcome }

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

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

function scopedSession(core: GameCore, onFailure: (method: string, error: string) => void): GameCore {
  return new Proxy(core, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      if (key === 'withCtx' || key === 'dispose') return value.bind(target)
      return (...args: unknown[]) => target.withCtx(() => {
        const result: unknown = Reflect.apply(value, target, args)
        if (typeof key === 'string' && result && typeof result === 'object'
          && 'ok' in result && result.ok === false && 'error' in result && typeof result.error === 'string') {
          onFailure(key, result.error)
        }
        return result
      })
    },
  })
}

export async function runBrowserCardTestScript(request: BrowserCardTestRequest, onTestStart: (name: string) => void = () => {}): Promise<BrowserCardTestResult> {
  const tests: Array<{ name: string; ok: boolean; error?: string }> = []
  let outcome: WorkshopBrowserTestOutcome
  const warnings: string[] = []
  const sessions: GameCore[] = []
  let lastFailure = ''
  const dispose = (from: number) => {
    for (const session of sessions.splice(from)) {
      warnings.push(...session.cardWarnings)
      session.dispose()
    }
  }
  try {
    // A native Card Source names its card by its single export (ADR 0052).
    if (!isNativeCardSource(request.source)) throw new Error(LEGACY_CARD_SOURCE_MESSAGE)
    const cardId = nativeCardId(request.source)!
    const card = prepareLocalCustomCard({ cardId, source: request.source })
    const createSession = () => {
      ensureCatalogLookupsInstalled()
      const state = createInitialState(42, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      }
      const core = new GameCore({
        stateOrSeed: state, customCards: [card], registerCustomCardImpl: registerLocalCustomCard,
      })
      sessions.push(core)
      const loaded = core.loadState(state)
      if (!loaded.ok || loaded.state.phase !== 'playing' || loaded.state.roundPhase !== 'work'
        || loaded.interaction.stateId !== 'idle') throw new Error('Failed to prepare a clean two-player work Session')
      return scopedSession(core, (method, error) => { lastFailure = `${method}: ${error}` })
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
      lastFailure = ''
      try {
        onTestStart(entry.name)
        await entry.run()
        tests.push({ name: entry.name, ok: true })
      } catch (error) {
        tests.push({ name: entry.name, ok: false, error: `${errorText(error)}${lastFailure ? `\nLast failed GameCore command: ${lastFailure}` : ''}` })
      }
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
