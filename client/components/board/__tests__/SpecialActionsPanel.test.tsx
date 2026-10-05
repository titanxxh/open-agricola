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
  it.each([
    [1, 1, 0], [2, 1, 1], [3, 2, 0], [4, 1, 0], [5, 1, 1], [6, 1, 1],
  ])('shows base resources for %i players', (playerCount, hiringFood, horseCost) => {
    render(<SpecialActionsPanel locale="en" playerCount={playerCount}
      cards={[{ ...cards[0]!, actions: ['horse-market', 'hiring-fair', 'black-market', 'illicit-work'] }]}
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
