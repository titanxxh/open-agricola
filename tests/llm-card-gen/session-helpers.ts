/**
 * Helper layer for LLM card-gen fixtures.
 *
 * Approach: instead of spinning up a full GameSession (which requires lots
 * of action-routing plumbing per fixture), we test at the hook-invocation
 * level — same pattern as server/__tests__/custom-code-executor.test.ts.
 *
 * Each fixture compiles the LLM-generated code, registers it, and then
 * invokes the relevant effect hook or listener to verify the returned
 * ActionFlow matches expectations. This is the "is the LLM code runnable?"
 * acceptance question — passing means the code validates AND produces the
 * right shape under the right input.
 */

import {
  validateAndCompileCustomCode,
  invokeCustomCodeEffect,
  invokeCustomCodeListener,
} from '../../server/custom-code/engine'
import {
  registerCustomCard,
  clearCustomCards,
  type CustomCardData,
} from '../../shared/cards/custom-registry'
import { registerExecutorBackedCustomCard } from '../../server/custom-code/runtime'
import { createInitialState } from '../../shared/logic/state'
import type { GameState, PlayerState, Resource } from '../../shared/game/types'
import { rewriteCardId } from './extract'

export type CardType = 'minor' | 'occupation'

export interface CompileLLMOptions {
  llmGeneratedCode: string
  cardId: string
  cardType: CardType
  cardName: string
  cardCost?: Partial<Resource>
  cardPrerequisite?: string
}

export interface CompiledCardArtifacts {
  compiledCode: string
  manifest: any
  cardData: CustomCardData
}

/**
 * Validate + compile the LLM-generated TS source. Throws with a useful error
 * message on validation failure. cardId in the source is rewritten to match
 * the provided fixture cardId so registration is stable.
 */
export function compileLLMCard(opts: CompileLLMOptions): CompiledCardArtifacts {
  const code = rewriteCardId(opts.llmGeneratedCode, opts.cardId)
  const result = validateAndCompileCustomCode(code, opts.cardId)
  if (!result.valid) {
    throw new Error(
      `validateAndCompileCustomCode failed for ${opts.cardId}:\n${result.errors.join('\n')}`,
    )
  }
  const cardData: CustomCardData = {
    cardType: opts.cardType,
    cardJson: {
      id: opts.cardId,
      name: opts.cardName,
      deck: 'CUSTOM',
      number: 0,
      desc: ['LLM-generated test card'],
      ...(opts.cardCost ? { cost: opts.cardCost } : {}),
      ...(opts.cardPrerequisite ? { prerequisite: opts.cardPrerequisite } : {}),
    } as CustomCardData['cardJson'],
    compiledCode: result.compiledCode,
    codeManifest: result.manifest,
  }
  return { compiledCode: result.compiledCode, manifest: result.manifest, cardData }
}

/** Register the card globally so it can be discovered by the engine. */
export function registerCard(cardData: CustomCardData): void {
  registerCustomCard(cardData, { allowGlobal: true })
  registerExecutorBackedCustomCard(cardData)
}

/** Clear any registered custom cards — call in afterEach. */
export function resetCards(): void {
  clearCustomCards()
}

/** Build a fresh GameState with a deterministic seed. */
export function freshState(seed = 42): GameState {
  return createInitialState(seed)
}

/** Mark a card as played by the given player. */
export function markCardPlayed(
  state: GameState,
  playerIndex: number,
  cardId: string,
  cardType: CardType,
): void {
  const player = state.players[playerIndex]
  if (!player) throw new Error(`no player at index ${playerIndex}`)
  if (cardType === 'minor') {
    player.minorPlayed.push(cardId)
  } else {
    player.occupationPlayed.push(cardId)
  }
}

/** Mutate player resources (e.g. set wood to 0 for a clean baseline). */
export function setResources(
  state: GameState,
  playerIndex: number,
  patch: Partial<Resource>,
): void {
  const player = state.players[playerIndex]
  if (!player) throw new Error(`no player at index ${playerIndex}`)
  for (const [key, value] of Object.entries(patch)) {
    ;(player.resources as any)[key] = value
  }
}

/**
 * Invoke an effect hook on the LLM card. Returns the result envelope from
 * the runtime — caller inspects `.ok` and `.result` (the ActionFlow the
 * hook returned, or scoring object for compute* hooks).
 */
export function invokeEffectHook(
  compiledCode: string,
  cardId: string,
  hookName: string,
  state: GameState,
  player: PlayerState,
  extra?: any,
) {
  return invokeCustomCodeEffect({
    compiledCode,
    cardId,
    hook: hookName as any,
    state,
    player,
    extra,
  } as any)
}

/**
 * Invoke a listener entry from the manifest by index (default 0 = first).
 */
export function invokeListenerByIndex(
  compiledCode: string,
  cardId: string,
  manifest: any,
  listenerIndex: number,
  context: any,
) {
  const listenerEntry = manifest.listeners?.[listenerIndex]
  if (!listenerEntry) {
    throw new Error(`no listener at index ${listenerIndex} in manifest`)
  }
  return invokeCustomCodeListener({
    compiledCode,
    cardId,
    listenerKey: listenerEntry.key,
    context,
  } as any)
}
