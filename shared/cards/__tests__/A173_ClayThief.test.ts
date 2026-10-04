import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { runCardEffectHook } from '../card-effects'
import type { ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'

const CARD_ID = 'A173_ClayThief'

const resources = (clay = 0): Resource => ({
  wood: 0,
  clay,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const player = (used = false): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  resources: resources(),
  rooms: 2,
  familySize: 2,
  fields: [],
  pastures: [],
  stables: [],
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [CARD_ID],
  minorHand: [],
  occupationHand: [],
  activeModifiers: [],
  cardStates: used ? { [CARD_ID]: { extraData: { used: true } } } : {},
  hasBeggingCard: false,
  usedWorkers: 0,
  totalWorkers: 2,
})

const space = (id: string, clay: number): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  resources: resources(clay),
  takenBy: [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
})

const state = (owner: PlayerState, hollowClay: number): GameState => ({
  round: 1,
  roundPhase: 'preparation',
  currentPlayerIndex: 0,
  players: [owner],
  actionSpaces: [space('hollow-56', hollowClay), space('hollow', 3)],
  log: [],
  roundActionOrder: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as unknown as GameState)

describe('A173 Clay Thief', () => {
  it('offers a once-game optional flow to mark used and collect all clay from hollow-56', () => {
    const owner = player()
    const flow = runCardEffectHook(state(owner, 4), owner, CARD_ID, 'onRoundStart')

    expect(flow).toMatchObject({
      type: 'seq',
      optional: true,
      children: [
        { actionId: 'special-effect', params: { kind: 'set-extra-data', key: 'used', value: true } },
        { actionId: 'special-effect', params: { kind: 'set-infobox' } },
        { actionId: 'collect', actionContext: { spaceId: 'hollow-56', resource: 'clay', amount: 4 } },
      ],
    })
  })

  it('does not trigger with no hollow-56 clay or after it has been used', () => {
    const owner = player()
    expect(runCardEffectHook(state(owner, 0), owner, CARD_ID, 'onRoundStart')).toBeNull()

    const usedOwner = player(true)
    expect(runCardEffectHook(state(usedOwner, 4), usedOwner, CARD_ID, 'onRoundStart')).toBeNull()
  })
})
