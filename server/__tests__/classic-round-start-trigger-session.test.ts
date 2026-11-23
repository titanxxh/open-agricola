import { afterEach, describe, expect, it } from 'vitest'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { GameSession } from '../game/authoritative-session'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { createWorkSession } from './_helpers/session-fixtures'

const DIAMOND_MINE = 'CWM073_DiamondMine'
const FAMILY_PLANNER = 'CWM019_FamilyPlanner'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

/**
 * Round 4 is worked out. A's Diamond Mine has 1 stone waiting on round 5, and A's Family Planner has a
 * round-start hook with nothing due, which is what made the round start offer an extra exchange.
 */
function setup(stoneDue = true) {
  const session = createWorkSession({ seed: 7319, options: { playerCount: 2 }, configure(state: GameState) {
    state.round = 4
    for (const player of state.players) {
      player.occupationHand = [PLACEHOLDER]
      player.minorHand = [PLACEHOLDER]
      player.resources.food = 20
      markAllWorkersUsed(state, player)
    }
    const owner = state.players[0]!
    owner.occupationPlayed = [FAMILY_PLANNER]
    owner.minorPlayed = [DIAMOND_MINE]
    owner.cardStates = { [FAMILY_PLANNER]: { extraData: { schedule: [] } } }
    if (stoneDue) state.futureMeeples = [{
      id: 'diamond-mine-5', cardId: DIAMOND_MINE, playerId: owner.id, round: 5, actionId: null, resources: { stone: 1 },
    }]
  } })
  sessions.push(session)
  return session
}

describe('round-start trigger selection', () => {
  it('offers only the card sources due this round, each naming its card', () => {
    const session = setup()
    const offers: ActionChoiceOption[][] = []
    const response = autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        if (interaction.request.kind !== 'select-trigger') return undefined
        expect(interaction.promptKey).toBe('ui.interactionSelectTrigger')
        offers.push(interaction.request.options)
        const receive = interaction.request.options.find(option => option.sourceCard === DIAMOND_MINE)!
        return current.resolveChoice(interaction.playerIndex, receive.value)
      },
    })

    expect(offers).toHaveLength(1)
    const [options] = offers
    expect(options!.filter(option => option.value !== '__pass__')).toEqual([
      expect.objectContaining({ labelKey: 'actions.receive.name', sourceCard: DIAMOND_MINE }),
    ])
    expect(options!.some(option => option.disabled && option.value !== '__pass__')).toBe(false)
    expect(options!.every(option => !option.sourceCard?.startsWith('child-'))).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(response.state.futureMeeples).toEqual([])
  })

  it('asks nothing at round start when no card source is due', () => {
    const session = setup(false)
    const response = autoAdvanceRoundEnd(session, {
      onChoice: interaction => {
        expect(interaction.request.kind).not.toBe('select-trigger')
        return undefined
      },
    })
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })
})
