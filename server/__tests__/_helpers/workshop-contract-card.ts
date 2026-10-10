import type { CustomCardData } from '../../../shared/cards/session-card-context'
import type { GameState } from '../../../shared/contract/types'
import { setWorkersAtHome } from '../../../shared/domain/player'
import { FIXED_ROUND_ACTION_ORDER } from '../../../tests/llm-card-gen/session-helpers'
import { validateAndCompileCustomCode } from '../../custom-code/engine'
import { createWorkSession } from './session-fixtures'

/** A leaf for card source: adds 1 to a counter on the card, so a test can read which handlers ran. */
export const COUNT_LEAF_SOURCE = `const count = (key) => ({ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'increment-counter', key, amount: 1 } })`

/** Compiles Workshop source through the real validator. `body` follows the CARD_ID and
 * CARD_DEF declarations and must declare CARD_IMPL. */
export function compileContractCard(cardId: string, body: string): CustomCardData {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${cardId}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Contract Probe' })
${body}
  `, cardId)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  return {
    cardType: 'minor',
    cardJson: { id: cardId, name: 'Contract Probe', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: compiled.compiledCode,
    codeManifest: compiled.manifest,
  }
}

/** A two-player work phase in round 10 with the first ten round cards of the fixed order
 * revealed and every space free. Player 0 has played the card; `workers` sets the workers at
 * home, and every player starts with 10 food and no other goods. */
export function createRoundTenSession(
  card: CustomCardData,
  { workers = [2, 0], configure }: { workers?: [number, number]; configure?: (state: GameState) => void } = {},
) {
  return createWorkSession({
    customCards: [card],
    configure: (state) => {
      state.round = 10
      state.roundActionOrder = [...FIXED_ROUND_ACTION_ORDER]
      state.actionSpaces.forEach((space) => { space.takenBy = [] })
      state.players.forEach((player, index) => {
        setWorkersAtHome(state, player, workers[index]!)
        Object.assign(player.resources, {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 10, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
        })
      })
      state.players[0]!.minorPlayed = [card.cardJson.id]
      configure?.(state)
    },
  })
}
