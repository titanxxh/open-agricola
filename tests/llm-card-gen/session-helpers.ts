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
import { collectBonusScores, type BonusScoreResult } from '../../shared/cards/card-effects'
import {
  setWorkersAtHome,
  markAllWorkersUsed,
  setActiveWorkerCount,
  workersAvailable,
} from '../../shared/game/player'
import { GameSession } from '../../server/game/authoritative-session'

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

// ---------------------------------------------------------------------------
// Session-level helpers (Task 1 additions)
// ---------------------------------------------------------------------------

export const FIXED_ROUND_ACTION_ORDER = [
  'sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
  'wish-children', 'western-quarry', 'house-redevelopment',
  'vegetable-seeds', 'pig-market',
  'eastern-quarry', 'cattle-market',
  'cultivation', 'urgent-wish-children',
  'farm-redevelopment',
] as const

export const ALL_ZERO_RESOURCES: Resource = {
  wood: 0, clay: 0, reed: 0, stone: 0,
  food: 0, grain: 0, vegetable: 0,
  sheep: 0, boar: 0, cattle: 0,
  begging: 0,
}

export function clearAllHands(state: GameState): void {
  state.players.forEach((p) => {
    p.minorHand = []
    p.occupationHand = []
  })
}

export function setHand(
  state: GameState,
  playerIndex: number,
  cards: { minor?: string[]; occupation?: string[] },
): void {
  const p = state.players[playerIndex]
  if (!p) throw new Error(`no player ${playerIndex}`)
  if (cards.minor) p.minorHand = [...cards.minor]
  if (cards.occupation) p.occupationHand = [...cards.occupation]
}

export function fixRoundActionOrder(
  state: GameState,
  order: readonly string[] = FIXED_ROUND_ACTION_ORDER,
): void {
  state.roundActionOrder = [...order]
}

export function freezeOtherPlayers(state: GameState, testPlayerIndex: number): void {
  state.players.forEach((p, i) => {
    if (i !== testPlayerIndex) setWorkersAtHome(state, p, 0)
  })
}

export interface BuildOpts {
  cardId: string
  cardType: CardType
  cardName: string
  cardCost?: Partial<Resource>
  cardPrerequisite?: string
  playerCount?: number
}

export interface BuildResult {
  session: GameSession
  cardData: CustomCardData
  manifest: any
}

/**
 * Auto-wrap every method call on `session` with `session.withCtx(...)`.
 *
 * Background: GameSession's constructor registers custom-card listeners into
 * `sessionCardContext` rather than the global card registry (because RoomManager
 * uses sessionCtx for per-session isolation). Listener dispatch only sees
 * sessionCtx listeners when `withSessionContext` is active. RoomManager wraps
 * every public call in `session.withCtx(...)`; fixtures need the same — without
 * the wrap, custom-card listeners silently never fire.
 *
 * Returns a Proxy that forwards every method through withCtx and every
 * property read straight through. Non-method properties stay live.
 */
function wrapSessionWithCtx(session: GameSession): GameSession {
  return new Proxy(session, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      // withCtx itself + dispose + any internals starting with _ pass through
      if (prop === 'withCtx' || prop === 'dispose') return value.bind(target)
      return (...args: unknown[]) =>
        target.withCtx(() => (value as (...a: unknown[]) => unknown).apply(target, args))
    },
  })
}

export function buildSessionWithLLMCard(llmCode: string, opts: BuildOpts): BuildResult {
  const compiled = compileLLMCard({
    llmGeneratedCode: llmCode,
    cardId: opts.cardId,
    cardType: opts.cardType,
    cardName: opts.cardName,
    cardCost: opts.cardCost,
    cardPrerequisite: opts.cardPrerequisite,
  })
  const rawSession = new GameSession(undefined, [compiled.cardData], {
    playerCount: opts.playerCount ?? 2,
  })
  // Force determinism on every fixture's session.
  // getState().state returns the live this.state reference — mutating it
  // mutates the session directly. Do NOT call loadState here: normalizeState
  // re-deals hands when any minorHand/occupationHand is empty.
  const state = rawSession.getState().state
  clearAllHands(state)
  fixRoundActionOrder(state)
  const session = wrapSessionWithCtx(rawSession)
  return { session, cardData: compiled.cardData, manifest: compiled.manifest }
}

export function getBonusBreakdown(
  state: GameState,
  player: PlayerState,
): { cardId: string; score: number }[] {
  const result: BonusScoreResult = collectBonusScores(state, player)
  return result.entries
}

/**
 * Variant for fixtures that have a session: runs collectBonusScores INSIDE
 * `session.withCtx(...)` so per-session custom-card effects are visible to
 * `getCardEffect()`. Without this, custom cards return empty bonus entries
 * because their effects are registered to sessionCtx (not the global
 * customEffects registry — see GameSession constructor).
 */
export function getBonusBreakdownForSession(
  session: GameSession,
  playerIndex: number,
): { cardId: string; score: number }[] {
  return session.withCtx(() => {
    const state = session.getState().state
    const player = state.players[playerIndex]
    if (!player) return []
    return collectBonusScores(state, player).entries
  })
}

export interface AutoAdvanceOptions {
  /** Defensive max iterations to avoid infinite loops on engine bugs. Default 50. */
  maxIterations?: number
}

/**
 * Build a zone list that preserves all of `player.resources.{sheep,boar,cattle}`
 * by greedily packing them into existing pastures (preferring same-type),
 * then the house tile, then loose stables. Used by autoAdvanceRoundEnd to
 * resolve animalReorg pendings without destroying animals — passing zones=[]
 * to confirmAnimalReorg zeroes resources.{sheep,boar,cattle}.
 *
 * Limitations: greedy single-type-per-pasture; may drop animals that don't
 * fit any zone (no extra zones synthesized). Sufficient for fixtures whose
 * pasture layout matches their animal counts.
 */
function buildPreservingZones(
  player: any,
): { id: string; zoneType: 'pasture' | 'house' | 'stable'; animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }[] {
  const remaining: Record<'sheep' | 'boar' | 'cattle', number> = {
    sheep: player.resources?.sheep ?? 0,
    boar: player.resources?.boar ?? 0,
    cattle: player.resources?.cattle ?? 0,
  }
  const zones: { id: string; zoneType: 'pasture' | 'house' | 'stable'; animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }[] = []
  // Pasture zones: prefer existing animalType, else pick any species with >0.
  for (const pasture of player.pastures ?? []) {
    const cap = (pasture.size ?? 1) * 2 + (pasture.stables ?? 0) * (pasture.size ?? 1) * 2
    const preferred: 'sheep' | 'boar' | 'cattle' | null = pasture.animalType ?? null
    let chosen: 'sheep' | 'boar' | 'cattle' | null = null
    if (preferred && remaining[preferred] > 0) chosen = preferred
    else {
      for (const k of ['cattle', 'boar', 'sheep'] as const) {
        if (remaining[k] > 0) { chosen = k; break }
      }
    }
    if (chosen) {
      const count = Math.min(cap, remaining[chosen])
      zones.push({ id: pasture.id, zoneType: 'pasture', animalType: chosen, animalCount: count })
      remaining[chosen] -= count
    } else {
      zones.push({ id: pasture.id, zoneType: 'pasture', animalType: null, animalCount: 0 })
    }
  }
  // House zone (1 animal of any type).
  let houseAssigned = false
  if (player.houseAnimalType && remaining[player.houseAnimalType as 'sheep' | 'boar' | 'cattle'] > 0) {
    const k = player.houseAnimalType as 'sheep' | 'boar' | 'cattle'
    zones.push({ id: 'house', zoneType: 'house', animalType: k, animalCount: 1 })
    remaining[k] -= 1
    houseAssigned = true
  }
  if (!houseAssigned) {
    zones.push({ id: 'house', zoneType: 'house', animalType: null, animalCount: 0 })
  }
  // Loose stables: each holds 1.
  for (const key of Object.keys(player.stableAnimals ?? {})) {
    let chosen: 'sheep' | 'boar' | 'cattle' | null = null
    for (const k of ['cattle', 'boar', 'sheep'] as const) {
      if (remaining[k] > 0) { chosen = k; break }
    }
    if (chosen) {
      zones.push({ id: `stable:${key}`, zoneType: 'stable', animalType: chosen, animalCount: 1 })
      remaining[chosen] -= 1
    } else {
      zones.push({ id: `stable:${key}`, zoneType: 'stable', animalType: null, animalCount: 0 })
    }
  }
  return zones
}

export function autoAdvanceRoundEnd(
  session: GameSession,
  opts: AutoAdvanceOptions = {},
): void {
  const max = opts.maxIterations ?? 50
  let iter = 0
  let resp = session.performRoundEnd()
  while (iter++ < max) {
    if (resp.pending.type === 'none' && session.getState().state.gameOver) return
    if (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
      continue
    }
    if (resp.pending.type === 'animalReorg') {
      // Default empty-zones wipes resources.{sheep,boar,cattle}; instead
      // build a zone list that preserves all current animals.
      const pi = resp.pending.playerIndex
      const player = session.getState().state.players[pi]
      const zones = player ? buildPreservingZones(player) : []
      resp = session.confirmAnimalReorg(pi, zones)
      continue
    }
    if (resp.pending.type === 'confirmNextPlayer') {
      resp = session.confirmNextPlayer()
      continue
    }
    if (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
      continue
    }
    if (resp.pending.type === 'choice') {
      throw new Error(
        `autoAdvanceRoundEnd hit a choice pending — fixture must pre-clear cards that prompt choices during round-end. choice: ${JSON.stringify(resp.pending).slice(0, 200)}`,
      )
    }
    // pending.type === 'none' but game not over → kick next round
    resp = session.performRoundEnd()
  }
  throw new Error(`autoAdvanceRoundEnd exceeded ${max} iterations`)
}

// Re-export player helpers for fixtures to import from one place
export { setWorkersAtHome, markAllWorkersUsed, setActiveWorkerCount, workersAvailable }
