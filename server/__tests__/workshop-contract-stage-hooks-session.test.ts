import { afterEach, describe, expect, it } from 'vitest'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import { flowCardEffectHooks } from '../../shared/cards/card-effects'
import type { GameState } from '../../shared/contract/types'
import type { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { createWorkSession } from './_helpers/session-fixtures'

/**
 * ADR 0025 opens a contract name only when a fixed behavior test drives it.
 * This is that test for every stage hook except onBuy (covered by the fixed
 * LLM card fixtures): one custom card counts each hook on its own card state
 * while a seeded two-player game runs from round 1's work phase to scoring.
 * Both players place two workers on accumulation spaces every round and beg
 * at each Harvest, so no hook depends on a player choice.
 */

const CARD_ID = 'CUSTOM_StageProbe'
const STAGE_HOOKS = flowCardEffectHooks.filter(hook => hook !== 'onBuy')
const PLACEMENTS = ['forest', 'clay-pit', 'reed-bank', 'fishing']
// A full game runs every stage hook in the isolate; on CI it takes longer than the default 5 s.
const FULL_GAME_TIMEOUT_MS = 30_000

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (configure: (state: GameState) => void) => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Stage Probe' })
const count = (key) => ({ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'increment-counter', key, amount: 1 } })
const CARD_IMPL = { effect: { id: CARD_ID,
${STAGE_HOOKS.map(hook => `  ${hook}: () => count('${hook}'),`).join('\n')}
} }
  `, CARD_ID)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  const card: CustomCardData = {
    cardType: 'minor',
    cardJson: { id: CARD_ID, name: 'Stage Probe', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: compiled.compiledCode,
    codeManifest: compiled.manifest,
  }
  const session = createWorkSession({ customCards: [card], configure })
  sessions.push(session)
  return session
}

const playToScoring = (session: GameSession) => {
  for (let step = 0; step < 400 && !session.getState().state.gameOver; step += 1) {
    const { state, interaction } = session.getState()
    if (interaction.stateId === 'wait' && interaction.request.kind === 'confirm-next-player') {
      confirmNextPlayer(session)
    } else if (interaction.stateId === 'wait' && interaction.request.kind === 'confirm-player-switch') {
      confirmPlayerSwitch(session)
    } else if (interaction.stateId === 'wait') {
      autoAdvanceRoundEnd(session, { initialResponse: session.getState(), maxIterations: 200 })
    } else {
      const space = state.roundPhase === 'work'
        ? PLACEMENTS.find(id => state.actionSpaces.find(candidate => candidate.id === id)!.takenBy.length === 0)
        : undefined
      if (!space) {
        autoAdvanceRoundEnd(session, { maxIterations: 200 })
        continue
      }
      const response = session.takeAction(state.currentPlayerIndex, space)
      if (!response.ok) throw new Error(`round ${state.round}, ${space}: ${response.error}`)
    }
  }
  return session.getState().state
}

describe('Workshop Capability Contract stage hooks', () => {
  it('dispatches every stage hook of a played custom card across a full two-player game', () => {
    const session = start((state) => { state.players[0]!.minorPlayed = [CARD_ID] })

    const final = playToScoring(session)

    expect(final.gameOver).toBe(true)
    expect(session.cardWarnings).toEqual([])
    const counters = final.players[0]!.cardStates[CARD_ID]?.counters ?? {}
    expect(Object.keys(counters).sort()).toEqual([...STAGE_HOOKS].sort())
    expect(counters).toEqual({
      // The fixture starts inside round 1's work phase, after that round's start hooks.
      onBeforeStartOfTurn: 13,
      onBeforeWork: 13,
      onRoundStart: 13,
      // The owner's two placements in each of the 14 rounds.
      onEndTurn: 28,
      onAllWorkersPlaced: 14,
      onBeforeReturnHome: 14,
      onStartReturnHome: 14,
      onReturnHome: 14,
      onRoundEnd: 14,
      onAfterRoundEnd: 14,
      // Harvests follow rounds 4, 7, 9, 11, 13 and 14.
      onBeforeHarvest: 6,
      onStartHarvest: 6,
      onStartHarvestFieldPhase: 6,
      onHarvestFieldPhase: 6,
      onAfterReap: 6,
      onEndHarvestFieldPhase: 6,
      onHarvest: 6,
      onStartHarvestFeedingPhase: 6,
      onHarvestFeedingPhase: 6,
      onEndHarvestFeedingPhase: 6,
      onEndHarvest: 6,
      onAfterHarvest: 6,
      onBeforeEndGame: 1,
    })
    // The card belongs to player 0 only.
    expect(final.players[1]!.cardStates[CARD_ID]).toBeUndefined()
  }, FULL_GAME_TIMEOUT_MS)

  it('dispatches no stage hook while the card stays in hand without handHooks', () => {
    const session = start((state) => { state.players[0]!.minorHand = [CARD_ID] })

    const final = playToScoring(session)

    expect(final.gameOver).toBe(true)
    expect(session.cardWarnings).toEqual([])
    expect(final.players[0]!.minorHand).toEqual([CARD_ID])
    expect(final.players[0]!.cardStates[CARD_ID]?.counters ?? {}).toEqual({})
  }, FULL_GAME_TIMEOUT_MS)
})
