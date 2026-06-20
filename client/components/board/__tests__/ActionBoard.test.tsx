// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ActionSpace, FutureMeeple, PlayerState, Resource } from '../../../../shared/contract/types'
import { ActionBoard } from '../ActionBoard'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

const expectActionStyle = (
  html: string,
  actionId: string,
  fragments: string[],
) => {
  const match = html.match(new RegExp(`data-action-id="${actionId}" style="([^"]+)"`))
  expect(match?.[1]).toBeDefined()
  for (const fragment of fragments) {
    expect(match![1]).toContain(fragment)
  }
}

describe('ActionBoard', () => {
  it('marks highlighted action spaces', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[createAction('forest', 'actions.forest.name')]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
        highlightedActionIds={new Set(['forest'])}
      />,
    )

    expect(html).toMatch(/action-card-holder[^"]*\bevent-highlight\b[^"]*" data-action-id="forest"/)
  })

  it('adds player-count-specific board classes', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const playerC = createPlayer('p3', 'PlayerC', 'yellow')
    const playerD = createPlayer('p4', 'PlayerD', 'black')
    const playerE = createPlayer('p5', 'PlayerE', 'green')
    const playerF = createPlayer('p6', 'PlayerF', 'purple')

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

    const html5p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC, playerD, playerE]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html5p).toContain('class="action-board action-board--5p"')

    const html6p = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB, playerC, playerD, playerE, playerF]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(html6p).toContain('class="action-board action-board--6p"')
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

  it('shows future meeple resources on unrevealed round placeholders', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const sheepMarket = createAction('sheep-market', 'actions.sheep-market.name')
    const futureMeeples: FutureMeeple[] = [
      {
        id: 'fm-sheep',
        cardId: 'PR05',
        playerId: 'p2',
        round: 4,
        actionId: 'sheep-market',
        resources: { sheep: 1 },
      },
      {
        id: 'fm-field',
        cardId: 'PR02',
        playerId: 'p1',
        round: 12,
        actionId: null,
        resources: { field: 1 },
      },
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[{ round: 4, action: sheepMarket }, { round: 12 }]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={futureMeeples}
        canTakeAction={() => false}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('turn-number-placeholder')
    expect(html).toContain('title="PlayerB: Sheep"')
    expect(html).toContain('data-owner-player="p2"')
    expect(html).toContain('res-icon-sheep')
    expect(html).toContain('title="PlayerA: Field"')
    expect(html).toContain('res-icon-field')
  })

  it('renders exclusive-use round slot as locked for non-owner before its normal round', () => {
    const owner = createPlayer('p1', 'Alice', 'red')
    const viewer = createPlayer('p2', 'Bob', 'blue')
    const action = {
      ...createAction('round14', 'actions.round14.name'),
      exclusiveUse: { playerId: 'p1', sourceCardId: 'B23_FinalScenario', untilRound: 14 },
    }
    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[{ round: 14, action }]}
        currentPlayer={viewer}
        players={[owner, viewer]}
        futureMeeples={[]}
        canTakeAction={() => false}
        takeAction={() => {}}
        currentRound={13}
        devMode={false}
      />,
    )

    expect(html).toContain('action-exclusive-use')
    expect(html).toContain('exclusive-locked')
    expect(html).toContain('Alice')
    expect(html).toContain('actions.round14.name')
    expect(html).toContain('disabled')
  })

  it('lets the board caller decide selectable action-space choices', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const forest = createAction('forest', 'actions.forest.name')
    const clayPit = createAction('clay-pit', 'actions.clay-pit.name')
    const selected: string[] = []
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })

    render(
      <ActionBoard
        locale="en"
        baseActions={[forest, clayPit]}
        roundSlots={[]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={(space) => space.id === 'forest'}
        takeAction={(space) => selected.push(space.id)}
        currentRound={1}
        devMode={false}
        actionSpaceSelectionActive={true}
      />,
    )

    const forestButton = screen.getByRole('button', { name: /Forest/i })
    const clayPitButton = screen.getByRole('button', { name: /Clay Pit/i })
    expect(forestButton).not.toBeDisabled()
    expect(clayPitButton).toBeDisabled()
    expect(forestButton.closest('.action-card-holder')?.className).toContain('choice-available')
    expect(clayPitButton.closest('.action-card-holder')?.className).toContain('choice-unavailable')
    fireEvent.click(forestButton)
    fireEvent.click(clayPitButton)
    expect(selected).toEqual(['forest'])
  })

  it('renders 5p shared expansion spaces on the board instead of the player-action row', () => {
    const players = [
      createPlayer('p1', 'PlayerA', 'red'),
      createPlayer('p2', 'PlayerB', 'blue'),
      createPlayer('p3', 'PlayerC', 'yellow'),
      createPlayer('p4', 'PlayerD', 'black'),
      createPlayer('p5', 'PlayerE', 'green'),
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[
          createAction('lessons-56-2f', 'actions.lessons-56-2f.name'),
          createAction('copse-56', 'actions.copse-56.name'),
          createAction('hollow-56', 'actions.hollow-56.name'),
          createAction('resource-market-56', 'actions.resource-market-56.name'),
        ]}
        roundSlots={[]}
        currentPlayer={players[0]!}
        players={players}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('action-board--5p')
    expect(html).toContain('data-action-id="lessons-56-2f"')
    expect(html).toContain('data-action-id="copse-56"')
    expect(html).toContain('data-action-id="hollow-56"')
    expect(html).toContain('data-action-id="resource-market-56"')
    expect(html).not.toContain('player-action-cards-row')
  })

  it('renders 6p-only spaces on the 6p board', () => {
    const players = [
      createPlayer('p1', 'PlayerA', 'red'),
      createPlayer('p2', 'PlayerB', 'blue'),
      createPlayer('p3', 'PlayerC', 'yellow'),
      createPlayer('p4', 'PlayerD', 'black'),
      createPlayer('p5', 'PlayerE', 'green'),
      createPlayer('p6', 'PlayerF', 'purple'),
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[
          createAction('farm-supplies-6', 'actions.farm-supplies-6.name'),
          createAction('resource-trade-6', 'actions.resource-trade-6.name'),
          createAction('corral-6', 'actions.corral-6.name'),
          createAction('side-job-6', 'actions.side-job-6.name'),
          createAction('improvement-6', 'actions.improvement-6.name'),
        ]}
        roundSlots={[]}
        currentPlayer={players[0]!}
        players={players}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('action-board--6p')
    expect(html).toContain('data-action-id="farm-supplies-6"')
    expect(html).toContain('data-action-id="resource-trade-6"')
    expect(html).toContain('data-action-id="corral-6"')
    expect(html).toContain('data-action-id="side-job-6"')
    expect(html).toContain('data-action-id="improvement-6"')
    expect(html).not.toContain('player-action-cards-row')
  })

  it('renders 5p animal market with compact icon lines that fit the original frame', () => {
    const players = [
      createPlayer('p1', 'PlayerA', 'red'),
      createPlayer('p2', 'PlayerB', 'blue'),
      createPlayer('p3', 'PlayerC', 'yellow'),
      createPlayer('p4', 'PlayerD', 'black'),
      createPlayer('p5', 'PlayerE', 'green'),
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[createAction('animal-market-56', 'actions.animal-market-56.name')]}
        roundSlots={[]}
        currentPlayer={players[0]!}
        players={players}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('data-action-id="animal-market-56"')
    expect(html).toContain('icon-line icon-line--animal-market')
    expect(html).not.toContain('<span class="text">Pay</span>')
    expect(html).toContain('<span>+1</span><span class="res-icon res-icon-cattle"></span><span>-1</span><span class="res-icon res-icon-food"></span>')
  })

  it('keeps repeated 5p extension action frames the same size as matching original spaces', () => {
    const players = [
      createPlayer('p1', 'PlayerA', 'red'),
      createPlayer('p2', 'PlayerB', 'blue'),
      createPlayer('p3', 'PlayerC', 'yellow'),
      createPlayer('p4', 'PlayerD', 'black'),
      createPlayer('p5', 'PlayerE', 'green'),
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[
          createAction('lessons-56-2f', 'actions.lessons-56-2f.name'),
          createAction('copse-56', 'actions.copse-56.name'),
          createAction('resource-market-56', 'actions.resource-market-56.name'),
          createAction('hollow-56', 'actions.hollow-56.name'),
          createAction('house-building-56', 'actions.house-building-56.name'),
          createAction('farm-expansion', 'actions.farm-expansion.name'),
        ]}
        roundSlots={[]}
        currentPlayer={players[0]!}
        players={players}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('width:1190px')
    expectActionStyle(html, 'lessons-56-2f', ['top:18px', 'left:24px', 'width:115px', 'height:94px'])
    expectActionStyle(html, 'copse-56', ['top:18px', 'left:256px', 'width:60px', 'height:83px'])
    expectActionStyle(html, 'resource-market-56', ['top:432px', 'left:192px', 'width:110px', 'height:65px'])
    expectActionStyle(html, 'hollow-56', ['top:532px', 'left:230px', 'width:60px', 'height:86px'])
    expectActionStyle(html, 'house-building-56', ['top:662px', 'left:24px', 'width:115px', 'height:134px'])
    expectActionStyle(html, 'farm-expansion', ['top:-3px', 'left:390px'])
  })

  it('keeps 6p rail frames in original action-frame sizes without overlapping the central board', () => {
    const players = [
      createPlayer('p1', 'PlayerA', 'red'),
      createPlayer('p2', 'PlayerB', 'blue'),
      createPlayer('p3', 'PlayerC', 'yellow'),
      createPlayer('p4', 'PlayerD', 'black'),
      createPlayer('p5', 'PlayerE', 'green'),
      createPlayer('p6', 'PlayerF', 'purple'),
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[
          createAction('farm-supplies-6', 'actions.farm-supplies-6.name'),
          createAction('resource-trade-6', 'actions.resource-trade-6.name'),
          createAction('lessons-56-2f', 'actions.lessons-56-2f.name'),
          createAction('hollow-56', 'actions.hollow-56.name'),
          createAction('farm-expansion', 'actions.farm-expansion.name'),
        ]}
        roundSlots={[]}
        currentPlayer={players[0]!}
        players={players}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('width:1370px')
    expect(html).not.toContain('action-board-base-outline')
    expectActionStyle(html, 'farm-supplies-6', ['top:18px', 'left:52px', 'width:115px', 'height:94px'])
    expectActionStyle(html, 'resource-trade-6', ['top:138px', 'left:52px', 'width:115px', 'height:94px'])
    expectActionStyle(html, 'lessons-56-2f', ['top:18px', 'left:204px', 'width:115px', 'height:94px'])
    expectActionStyle(html, 'hollow-56', ['top:532px', 'left:410px', 'width:60px', 'height:86px'])
    expectActionStyle(html, 'farm-expansion', ['top:-3px', 'left:570px'])
  })

  it('renders visible linked action markers only when both paired spaces are on the board', () => {
    const players = [
      createPlayer('p1', 'PlayerA', 'red'),
      createPlayer('p2', 'PlayerB', 'blue'),
      createPlayer('p3', 'PlayerC', 'yellow'),
      createPlayer('p4', 'PlayerD', 'black'),
      createPlayer('p5', 'PlayerE', 'green'),
    ]
    const lessons = {
      ...createAction('lessons-56-2f', 'actions.lessons-56-2f.name'),
      linkedGroupId: 'lessons-copse-56',
    }
    const copse = {
      ...createAction('copse-56', 'actions.copse-56.name'),
      linkedGroupId: 'lessons-copse-56',
    }
    const animalMarket = {
      ...createAction('animal-market-56', 'actions.animal-market-56.name'),
      linkedGroupId: 'animal-resource-56',
    }

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[lessons, copse, animalMarket]}
        roundSlots={[]}
        currentPlayer={players[0]!}
        players={players}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html).toContain('class="linked-action-markers"')
    expect(html).toContain('data-linked-group-id="lessons-copse-56"')
    expect(html).toContain('data-linked-from-id="lessons-56-2f"')
    expect(html).toContain('data-linked-to-id="copse-56"')
    expect(html).not.toContain('data-linked-group-id="animal-resource-56"')
  })

  it('renders blocked linked spaces as locked and non-clickable without a worker marker', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    const playerC = createPlayer('p3', 'PlayerC', 'yellow')
    const playerD = createPlayer('p4', 'PlayerD', 'black')
    const playerE = createPlayer('p5', 'PlayerE', 'green')
    const blocked = {
      ...createAction('copse-56', 'actions.copse-56.name'),
      linkedGroupId: 'lessons-copse-56',
      blockedBy: [{ playerId: 'p1', workerId: '1', sourceSpaceId: 'lessons-56-2f' }],
    }
    const selected: string[] = []
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })

    render(
      <ActionBoard
        locale="en"
        baseActions={[blocked]}
        roundSlots={[]}
        currentPlayer={playerB}
        players={[playerA, playerB, playerC, playerD, playerE]}
        futureMeeples={[]}
        canTakeAction={() => true}
        takeAction={(space) => selected.push(space.id)}
        currentRound={1}
        devMode={false}
        actionSpaceSelectionActive={true}
      />,
    )

    const button = screen.getByRole('button', { name: /Copse/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleName(/blocked/i)
    expect(button.closest('.action-card-holder')?.className).toContain('blocked')
    expect(button.closest('.action-card-holder')?.querySelector('.action-space-lock')).not.toBeNull()
    expect(button.closest('.action-card-holder')?.querySelector('.farmer-holder')).toBeNull()
    fireEvent.click(button)
    expect(selected).toEqual([])
  })

  it('removes the family-growth child marker when the newborn leaves the space', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    playerA.workers = [
      { id: '1', isActive: true, isNewborn: false },
      { id: '3', isActive: true, isNewborn: true },
    ]
    const wishChildren = createAction('wish-children', 'actions.wish-children.name')
    wishChildren.takenBy = [
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p1', workerId: '3' },
    ]

    const withNewborn = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[{ round: 1, action: wishChildren }]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => false}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(withNewborn.match(/action-farmer-red child/g) ?? []).toHaveLength(1)
    expect(withNewborn.match(/action-farmer-red"/g) ?? []).toHaveLength(1)

    playerA.workers[1]!.isNewborn = false
    wishChildren.takenBy = [{ playerId: 'p1', workerId: '1' }]
    const afterPromotion = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[{ round: 1, action: wishChildren }]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => false}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )
    expect(afterPromotion).not.toContain('action-farmer-red child')
    expect(afterPromotion.match(/action-farmer-red"/g) ?? []).toHaveLength(1)
  })

  it('shows only the current newborn once when a family-growth space is reused', () => {
    const playerA = createPlayer('p1', 'PlayerA', 'red')
    const playerB = createPlayer('p2', 'PlayerB', 'blue')
    playerA.workers = [
      { id: '1', isActive: true, isNewborn: false },
      { id: '3', isActive: true, isNewborn: false },
      { id: '4', isActive: true, isNewborn: true },
    ]
    const urgentWishChildren = createAction('urgent-wish-children', 'actions.urgent-wish-children.name')
    urgentWishChildren.takenBy = [
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p1', workerId: '3' },
      { playerId: 'p1', workerId: '4' },
    ]

    const html = renderToStaticMarkup(
      <ActionBoard
        locale="en"
        baseActions={[]}
        roundSlots={[{ round: 1, action: urgentWishChildren }]}
        currentPlayer={playerA}
        players={[playerA, playerB]}
        futureMeeples={[]}
        canTakeAction={() => false}
        takeAction={() => {}}
        currentRound={1}
        devMode={false}
      />,
    )

    expect(html.match(/action-farmer-red child/g) ?? []).toHaveLength(1)
    expect(html.match(/action-farmer-red"/g) ?? []).toHaveLength(2)
    expect(html).not.toContain('has-offspring')
    expect(html).toMatch(
      /action-farmer-stack"[^>]*><div class="action-farmer action-farmer-red"><\/div><\/div>[\s\S]*action-farmer-stack"[^>]*><div class="action-farmer action-farmer-red"><\/div><\/div>[\s\S]*action-farmer-stack"[^>]*><div class="action-farmer action-farmer-red child"><\/div><\/div>/,
    )
  })
})
