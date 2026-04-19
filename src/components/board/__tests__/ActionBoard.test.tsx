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
  occupationPlayed: [],houseAnimalType: null,
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
  it('adds player-count-specific board classes', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const playerC = createPlayer('p3', 'PlayerC', 'yellow')
    const playerD = createPlayer('p4', 'PlayerD', 'black')

    const html2p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html2p).toContain('class="action-board action-board--2p"')

    const html3p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html3p).toContain('class="action-board action-board--3p"')

    const html4p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC, playerD]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html4p).toContain('class="action-board action-board--4p"')
  })

  it('uses BGA-matching 3p and 4p side-space positions', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const playerC = createPlayer('p3', 'PlayerC', 'yellow')
    const playerD = createPlayer('p4', 'PlayerD', 'black')

    const html3p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[createAction('resource-market', 'actions.resource-market.name')]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html3p).toContain('top:255px')

    const html4p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[createAction('grove', 'actions.grove.name')]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC, playerD]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html4p).toContain('top:138px')
  })

  it('uses central-only 2p board geometry', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')

    const html2p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[createAction('meeting-place', 'actions.meeting-place.name')]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html2p).toContain('width:830px')
    expect(html2p).toContain('left:31px')
  })

  it('renders 3p resource market and lessons-3 with icon descs', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const playerC = createPlayer('p3', 'PlayerC', 'yellow')

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="zh"
        baseActions={[
          createAction('resource-market', 'actions.resource-market.name'),
          createAction('lessons-3', 'actions.lessons-3.name'),
        ]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).not.toContain('action-desc--plain')
    expect(html).toContain('res-icon-food')
    expect(html).toContain('res-icon-occupation')
    expect(html).toContain('res-icon-reed')
    expect(html).toContain('res-icon-stone')
    expect(html).toContain('icon-line icon-line--resource-market')
    expect(html).toContain('icon-token icon-token--slash')
    expect(html).toContain('icon-token icon-token--spaced-plus')
  })

  it('does not render C22_BasketChair as an action-board space even when it is in minorPlayed', () => {
    // C22 is a MinorImprovement, NOT a PlayerActionCard (no registerPlayerActionSpace).
    // It must never appear in baseActions / ActionBoard tiles.
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    // Simulate C22 already played — it should be in minorPlayed but NOT in actionSpaces.
    playerA.minorPlayed = ['C22_BasketChair']

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}   // actionSpaces does NOT contain C22_BasketChair
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    // The PlayerCard inner div carries data-id={cardId}; absence confirms C22 is not rendered.
    expect(html).not.toContain('data-id="C22_BasketChair"')
  })

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
