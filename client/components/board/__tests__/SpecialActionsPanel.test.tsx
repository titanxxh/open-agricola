// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpecialActionsPanel } from '../SpecialActionsPanel'
import type { GameState } from '../../../../shared/contract/types'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../../../shared/moor/types'
import { moorSpecialActionCardDefinitions } from '../../../../shared/moor/special-action-cards'
import { createInitialState } from '../../../../shared/session/state-bootstrap'
import {
  canTakeVisibleMoorSpecialAction,
  isMoorSpecialActionCardUsableByPlayer,
} from '../../../../shared/moor/special-action-availability'
import {
  MOOR_SPECIAL_ACTION_BORROW_FOOD,
  moorSpecialActionBorrowCost,
} from '../../../../shared/domain/moor-special-action-values'

const cards: MoorSpecialActionCardState[] = [
  {
    id: 'moor-special-cut-peat',
    players: [2, 3, 4, 5, 6],
    actions: ['cut-peat'],
    image: '/assets/moor/special-action-card/moor-special-cut-peat.webp',
    location: { kind: 'market' },
  },
  {
    id: 'moor-special-hiring-fair',
    players: [2, 3, 4, 5, 6],
    actions: ['hiring-fair'],
    image: '/assets/moor/special-action-card/moor-special-hiring-fair.webp',
    location: { kind: 'playerFaceUp', playerId: 'p2' },
  },
]

describe('SpecialActionsPanel', () => {
  it('shows the solo current card, public discard and only next-card icons beside the draw count', () => {
    const current: MoorSpecialActionCardState = { ...cards[0]!, location: { kind: 'solo-current' } }
    const discarded: MoorSpecialActionCardState = { ...cards[1]!, location: { kind: 'solo-discard', order: 0 } }
    const onTake = vi.fn()
    const { container } = render(<SpecialActionsPanel locale="en" playerCount={1} cards={[current, discarded]}
      soloSupply={{ drawCount: 5, nextCardActions: ['fell-trees'], retentionPaid: true }} currentPlayerId="p1"
      availability={{ [current.id]: { cardUsable: true } }} canTakeSpecialAction={() => true} selected={null} onTakeAction={onTake} />)
    const draw = screen.getByRole('group', { name: 'Draw pile: 5' })
    expect(draw.querySelector('[data-card-id]')).toBeNull()
    expect(draw.querySelector('[data-resource]')).toBeNull()
    expect(screen.getByText('Kept for this round')).toBeVisible()
    expect(screen.getByText('Current special action card')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cut Peat' }))
    expect(onTake).toHaveBeenCalledExactlyOnceWith(current.id, 'cut-peat')
    expect(container.querySelector('details')).toHaveTextContent('Discard pile')
    expect(container.querySelector(`[data-card-id="${discarded.id}"]`)).toBeInTheDocument()
  })
  it.each([
    [1, 1, 0], [2, 1, 1], [3, 2, 0], [4, 1, 0], [5, 1, 1], [6, 1, 1],
  ])('shows base resources for %i players', (playerCount, hiringFood, horseCost) => {
    render(<SpecialActionsPanel locale="en" playerCount={playerCount}
      cards={[{ ...cards[0]!, location: playerCount === 1 ? { kind: 'solo-current' } : { kind: 'market' }, actions: ['horse-market', 'hiring-fair', 'black-market', 'illicit-work'] }]}
      currentPlayerId="p1" availability={{}} canTakeSpecialAction={() => false}
      selected={null} onTakeAction={() => {}} />)

    expect(screen.getByRole('img', { name: `Gain ${hiringFood} food` })).toBeVisible()
    const horse = screen.getByRole('img', { name: `Pay ${horseCost} food to gain 1 horse` })
    expect(horse.querySelector('[data-resource="horse"]')).toHaveAttribute('data-amount', '1')
    if (horseCost === 0) expect(horse.querySelector('[data-resource="food"]')).toBeNull()
    else expect(horse.querySelector('[data-resource="food"]')).toHaveAttribute('data-amount', '1')
    expect(screen.getByRole('button', { name: 'Black Market' })).toHaveTextContent('Pay improvement cost separately')
    expect(screen.getByRole('button', { name: 'Illicit Work' })).toHaveTextContent('Pay improvement cost separately')
    for (const action of ['Black Market', 'Illicit Work']) {
      expect(screen.getByRole('button', { name: action }).querySelector('[data-resource="fuel"]'))
        .toHaveAttribute('data-amount', '1')
    }
  })

  it.each<MoorSpecialActionCardState['location']>([
    { kind: 'market' },
    { kind: 'playerFaceUp', playerId: 'p1' },
    { kind: 'playerFaceUp', playerId: 'p2' },
    { kind: 'playerFaceDown', playerId: 'p2' },
  ])('shows Chinese action titles on every card at $kind', (location) => {
    const localizedNames = {
      'fell-trees': '伐木', 'slash-and-burn': '刀耕火种', 'cut-peat': '挖泥炭',
      'horse-market': '马市', 'hiring-fair': '雇工集市', 'black-market': '黑市', 'illicit-work': '非法工作',
    }
    const { container } = render(
      <SpecialActionsPanel locale="zh" playerCount={2}
        cards={moorSpecialActionCardDefinitions.map((card) => ({ ...card, location }))}
        currentPlayerId="p1" availability={{}} canTakeSpecialAction={() => false}
        selected={null} onTakeAction={() => {}} />,
    )

    const buttons = container.querySelectorAll('button')
    const actions = moorSpecialActionCardDefinitions.flatMap((card) => card.actions)
    expect(buttons).toHaveLength(actions.length)
    buttons.forEach((button, index) => {
      expect(button).toHaveTextContent(localizedNames[actions[index]!])
      expect(button).toBeDisabled()
    })
  })

  it('draws the terrain each action removes, what it yields and when it buys an improvement', () => {
    const drawn = {
      'cut-peat': ['moor'], 'fell-trees': ['forest'], 'slash-and-burn': ['forest', 'field'],
      'horse-market': [], 'hiring-fair': [], 'black-market': ['minor'], 'illicit-work': ['major'],
    }
    const { container } = render(
      <SpecialActionsPanel locale="en" playerCount={2}
        cards={moorSpecialActionCardDefinitions.map((card) => ({ ...card, location: { kind: 'market' } }))}
        currentPlayerId="p1" availability={{}} canTakeSpecialAction={() => false}
        selected={null} onTakeAction={() => {}} />,
    )

    const actions = moorSpecialActionCardDefinitions.flatMap((card) => card.actions)
    expect(new Set(actions)).toEqual(new Set(Object.keys(drawn)))
    container.querySelectorAll('button').forEach((button, index) => {
      const action = actions[index]!
      expect([...button.querySelectorAll('.special-action-card__token .res-icon')].map((icon) => icon.className))
        .toEqual(drawn[action].map((token) => `res-icon res-icon-${token}`))
      expect(button.querySelector('.special-action-card__note') !== null).toBe(action === 'black-market' || action === 'illicit-work')
    })
  })

  it('renders localized action diagrams and sends card/action ids', () => {
    const onTake = vi.fn()

    const { container } = render(
      <SpecialActionsPanel
        locale="en"
        playerCount={2}
        cards={cards}
        currentPlayerId="p1"
        availability={{ [cards[0]!.id]: { cardUsable: true }, [cards[1]!.id]: { cardUsable: true } }}
        canTakeSpecialAction={() => true}
        selected={null}
        onTakeAction={onTake}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cut Peat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hiring Fair' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cut Peat' })).toHaveTextContent('Cut Peat')
    expect(screen.getByRole('img', { name: 'Remove 1 moor to gain 3 fuel' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cut Peat' }).querySelector('[data-resource="fuel"]'))
      .toHaveAttribute('data-amount', '3')
    expect(container.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hiring Fair' }))

    expect(onTake).toHaveBeenCalledWith('moor-special-hiring-fair', 'hiring-fair')
  })

  it('uses authoritative card usability independently of location', () => {
    render(
      <SpecialActionsPanel
        locale="en"
        playerCount={2}
        cards={[
          { ...cards[0]!, location: { kind: 'market' } },
          { ...cards[1]!, location: { kind: 'playerFaceUp', playerId: 'p1' } },
        ]}
        currentPlayerId="p1"
        availability={{ [cards[0]!.id]: { cardUsable: false }, [cards[1]!.id]: { cardUsable: true } }}
        canTakeSpecialAction={() => true}
        selected={null}
        onTakeAction={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: /Cut Peat/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Hiring Fair/ })).toBeEnabled()
  })

  it('keeps per-action availability and the selected terrain action', () => {
    const onTake = vi.fn()
    const card = { ...cards[0]!, actions: ['cut-peat', 'fell-trees'] as const }
    render(<SpecialActionsPanel locale="zh" playerCount={2}
      cards={[{ ...card, actions: [...card.actions] }]}
      currentPlayerId="p1" availability={{ [card.id]: { cardUsable: true } }}
      canTakeSpecialAction={(_, actionId) => actionId === 'cut-peat'}
      selected={{ cardId: card.id, actionId: 'cut-peat' }} onTakeAction={onTake} />)

    expect(screen.getByRole('button', { name: '伐木' })).toBeDisabled()
    const selected = screen.getByRole('button', { name: '挖泥炭' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(selected)
    expect(onTake).toHaveBeenCalledWith(card.id, 'cut-peat')
  })

  it('shows a 2-food borrow fee from the server cost before a face-up special action can be clicked', () => {
    const state = createInitialState(41, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      ordinaryCardDeckSeed: 42,
      parentSelectionSeed: 42,
    })
    const work = state.farmersOfTheMoor!.specialActionCards.find((card) => card.id === 'moor-special-1-2-market-work')!
    const terrain = state.farmersOfTheMoor!.specialActionCards.find((card) => card.id === 'moor-special-1-2-terrain')!
    const actor = (index: number) => state.players[index]!
    const button = (container: HTMLElement, card: MoorSpecialActionCardState, name: string) => {
      const found = [...container.querySelectorAll(`[data-card-id="${card.id}"] button`)].find((element) =>
        element.getAttribute('aria-label') === name || element.textContent?.includes(name),
      )
      expect(found).toBeTruthy()
      return found as HTMLButtonElement
    }

    actor(0).resources.food = 1
    actor(0).resources.fuel = 0
    const market = renderActor(state, 0)
    const marketWork = market.container.querySelector(`[data-card-id="${work.id}"]`)!
    expect(moorSpecialActionBorrowCost(state, work.id)).toEqual({})
    expect(marketWork.querySelector('[data-special-action-fee]')).toBeNull()
    expect(marketWork.className).not.toContain('special-action-card--paid')
    expect(button(market.container, work, 'Horse Market')).toBeEnabled()
    expect(button(market.container, work, 'Horse Market').querySelector('[data-resource="food"]'))
      .toHaveAttribute('data-amount', '1')
    market.unmount()

    work.location = { kind: 'playerFaceUp', playerId: 'p1' }
    actor(1).resources.food = MOOR_SPECIAL_ACTION_BORROW_FOOD
    actor(1).resources.fuel = 0
    expect(moorSpecialActionBorrowCost(state, work.id)).toEqual({ food: MOOR_SPECIAL_ACTION_BORROW_FOOD })
    expect(canTakeVisibleMoorSpecialAction(withActor(state, 1), actor(1), work, 'hiring-fair')).toBe(true)
    expect(canTakeVisibleMoorSpecialAction(withActor(state, 1), actor(1), work, 'horse-market')).toBe(false)
    const ready = renderActor(state, 1, { cardId: work.id, actionId: 'hiring-fair' })
    const readyWork = ready.container.querySelector(`[data-card-id="${work.id}"]`)!
    const fee = readyWork.querySelector('[data-special-action-fee="food:2"]')
    expect(fee).not.toBeNull()
    expect(readyWork).toHaveClass('special-action-card--paid')
    expect(readyWork).not.toHaveClass('special-action-card--paid-unavailable')
    expect(fee?.querySelector('.res-icon-food')).not.toBeNull()
    expect(fee?.querySelector('[data-resource="food"]')).toHaveAttribute('data-amount', '2')
    expect(readyWork.querySelector('.special-action-card__status')).toHaveTextContent('Borrow 2 food', { exact: true })
    expect(readyWork.querySelector('.special-action-card__status [data-special-action-fee]')).toBeNull()
    const hiring = button(ready.container, work, 'Hiring Fair')
    expect(hiring).toBeEnabled()
    expect(hiring).toHaveClass('selected')
    expect(hiring).toHaveAttribute('aria-pressed', 'true')
    expect(hiring).toHaveAttribute('aria-label', 'Hiring Fair')
    expect(hiring).toHaveAttribute('aria-describedby', `${work.id}-hiring-fair-effect ${work.id}-status`)
    expect(button(ready.container, work, 'Horse Market')).toBeDisabled()
    const readyTerrain = ready.container.querySelector(`[data-card-id="${terrain.id}"]`)!
    expect(readyTerrain.querySelector('[data-special-action-fee]')).toBeNull()
    expect(readyTerrain.className).not.toContain('special-action-card--paid')
    expect(button(ready.container, terrain, 'Cut Peat')).toBeEnabled()
    ready.unmount()

    actor(1).resources.food = MOOR_SPECIAL_ACTION_BORROW_FOOD - 1
    actor(1).resources.fuel = 9
    for (const actionId of work.actions) {
      expect(canTakeVisibleMoorSpecialAction(withActor(state, 1), actor(1), work, actionId)).toBe(false)
    }
    const short = renderActor(state, 1)
    const shortWork = short.container.querySelector(`[data-card-id="${work.id}"]`)!
    expect(shortWork).toHaveClass('special-action-card--paid-unavailable')
    expect(shortWork).not.toHaveClass('special-action-card--paid')
    expect(shortWork.querySelector('[data-special-action-fee="food:2"] .res-icon-food')).not.toBeNull()
    for (const action of shortWork.querySelectorAll('button')) expect(action).toBeDisabled()
    expect(button(short.container, terrain, 'Cut Peat')).toBeEnabled()
    expect(short.container.querySelector(`[data-card-id="${terrain.id}"] [data-special-action-fee]`)).toBeNull()
    short.unmount()

    actor(0).resources.food = 9
    const owner = renderActor(state, 0)
    const ownWork = owner.container.querySelector(`[data-card-id="${work.id}"]`)!
    expect(ownWork.querySelector('[data-special-action-fee]')).toBeNull()
    expect(ownWork).toHaveClass('special-action-card--disabled')
    expect(ownWork.className).not.toContain('special-action-card--paid')
    expect(ownWork.querySelector('.special-action-card__status')).toHaveTextContent('Used')
    for (const action of ownWork.querySelectorAll('button')) expect(action).toBeDisabled()
    owner.unmount()

    work.location = { kind: 'playerFaceDown', playerId: 'p1' }
    actor(1).resources.food = 9
    const hidden = renderActor(state, 1)
    const hiddenWork = hidden.container.querySelector(`[data-card-id="${work.id}"]`)!
    expect(hiddenWork.querySelector('[data-special-action-fee]')).toBeNull()
    expect(hiddenWork.className).not.toContain('special-action-card--paid')
    expect(hiddenWork).toHaveClass('special-action-card--disabled')
    for (const action of hiddenWork.querySelectorAll('button')) expect(action).toBeDisabled()
    hidden.unmount()

    const solo = createInitialState(41, {
      playerCount: 1,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      ordinaryCardDeckSeed: 42,
      parentSelectionSeed: 42,
    })
    const soloCard = solo.farmersOfTheMoor!.specialActionCards.find((card) => card.actions.includes('cut-peat'))!
    soloCard.location = { kind: 'solo-current' }
    solo.players[0]!.resources.food = 0
    solo.players[0]!.resources.fuel = 0
    const soloView = renderActor(solo, 0)
    expect(moorSpecialActionBorrowCost(solo, soloCard.id)).toEqual({})
    expect(soloView.container.querySelector('[data-special-action-fee]')).toBeNull()
    expect(soloView.container.querySelector('.special-action-card--paid, .special-action-card--paid-unavailable')).toBeNull()
    expect(button(soloView.container, soloCard, 'Cut Peat')).toBeEnabled()
  })
})

const withActor = (state: GameState, actorIndex: number) => {
  state.currentPlayerIndex = actorIndex
  return state
}

const renderActor = (
  state: GameState,
  actorIndex: number,
  selected: { cardId: string; actionId: MoorSpecialActionId } | null = null,
) => {
  const actor = withActor(state, actorIndex).players[actorIndex]!
  const cards = state.farmersOfTheMoor!.specialActionCards
  return render(
    <SpecialActionsPanel
      locale="en"
      playerCount={state.players.length}
      cards={cards}
      currentPlayerId={actor.id}
      availability={Object.fromEntries(cards.map((card) => [card.id, {
        cardUsable: isMoorSpecialActionCardUsableByPlayer(card, actor.id),
        ...Object.fromEntries(card.actions.map((actionId) => [
          actionId,
          canTakeVisibleMoorSpecialAction(state, actor, card, actionId),
        ])),
      }]))}
      canTakeSpecialAction={(card, actionId) => canTakeVisibleMoorSpecialAction(state, actor, card, actionId)}
      selected={selected}
      onTakeAction={() => {}}
    />,
  )
}
