// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpecialActionsPanel } from '../SpecialActionsPanel'
import type { MoorSpecialActionCardState } from '../../../../shared/moor/types'
import { moorSpecialActionCardDefinitions } from '../../../../shared/moor/special-action-cards'

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
})
