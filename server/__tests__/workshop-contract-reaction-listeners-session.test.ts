import { afterEach, describe, expect, it } from 'vitest'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { createWorkSession } from './_helpers/session-fixtures'

/**
 * ADR 0025 fixed behavior test for the reaction phases before,
 * immediatelyAfter and after, on the listener actions that an ordinary
 * placement round and a Harvest dispatch without any player choice:
 * collect, place-farmer and breed. A seeded two-player game runs rounds 1-4
 * and the first Harvest; both players place two workers on accumulation
 * spaces each round. Player 0 has played the card; its listeners keep the
 * default player scope and count themselves on the card state.
 */

const CARD_ID = 'CUSTOM_ReactionProbe'
const ACTIONS = ['collect', 'place-farmer', 'breed']
const PHASES = ['before', 'immediatelyAfter', 'after']
const PLACEMENTS = ['forest', 'clay-pit', 'reed-bank', 'fishing']
// Four rounds and a Harvest of isolate calls come close to the default 5 s on CI.
const FOUR_ROUNDS_TIMEOUT_MS = 20_000

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

describe('Workshop Capability Contract reaction listeners', () => {
  it('dispatches the owner\'s collect, place-farmer and breed reactions through the first Harvest', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Reaction Probe' })
const count = (key) => ({ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'increment-counter', key, amount: 1 } })
const CARD_IMPL = { listeners: [
${ACTIONS.flatMap(action => PHASES.map(phase => `  { cardIds: [CARD_ID], actions: ['${action}'], phases: ['${phase}'],
    handler: () => ({ sourceCard: CARD_ID, flow: count('${phase}:${action}') }) },`)).join('\n')}
] }
    `, CARD_ID)
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const card: CustomCardData = {
      cardType: 'minor',
      cardJson: { id: CARD_ID, name: 'Reaction Probe', deck: 'CUSTOM', number: 0, desc: [] },
      compiledCode: compiled.compiledCode,
      codeManifest: compiled.manifest,
    }
    const session = createWorkSession({ customCards: [card], configure: (state) => { state.players[0]!.minorPlayed = [CARD_ID] } })
    sessions.push(session)

    for (let step = 0; step < 80 && session.getState().state.round < 5; step += 1) {
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

    const final = session.getState().state
    expect(final.round).toBe(5)
    expect(session.cardWarnings).toEqual([])
    expect(final.players[0]!.cardStates[CARD_ID]?.counters).toEqual({
      // The owner's two placements in each of four rounds; the opponent's eight are not counted.
      'before:collect': 8,
      'immediatelyAfter:collect': 8,
      'after:collect': 8,
      // A placement has no immediatelyAfter dispatch.
      'before:place-farmer': 8,
      'after:place-farmer': 8,
      // The owner's breeding step of the round-4 Harvest.
      'before:breed': 1,
      'immediatelyAfter:breed': 1,
      'after:breed': 1,
    })
    expect(final.players[1]!.cardStates[CARD_ID]).toBeUndefined()
  }, FOUR_ROUNDS_TIMEOUT_MS)
})
