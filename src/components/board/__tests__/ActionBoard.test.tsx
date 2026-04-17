import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ActionSpace, FutureMeeple, PlayerState, Resource } from '../../../../shared/game/types'
import { ActionBoard } from '../ActionBoard'

const resources = (): Resource => ({
  wood: 0,
  clay: 0,
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

const createPlayer = (id: string, name: string, color: PlayerState['color']): PlayerState => ({
  id,
  name,
  color,
  resources: resources(),
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const createAction = (id: string, nameKey: string): ActionSpace => ({
  id,
  nameKey,
  descriptionKey: `${nameKey}.desc`,
  roundAvailable: 1,
  gainPerRound: resources(),
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: resources(),
  takenBy: [],
})

describe('ActionBoard', () => {
  it('shows owner name when hovering future meeple resources', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const sheepMarket = createAction('sheep-market', 'actions.sheep-market.name')
    const futureMeeples: FutureMeeple[] = [
      {
        id: 'fm-1',
        cardId: 'A74_StableTree',
        playerId: 'p1',
        round: 3,
        actionId: 'sheep-market',
        resources: { wood: 1 },
      },
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[{ round: 3, action: sheepMarket }]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={futureMeeples}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={3}
        devMode={false}
      />,
    )

    expect(html).toContain('title="PlayerA: Wood"')
    expect(html).toContain('data-owner-player="p1"')
  })
})
