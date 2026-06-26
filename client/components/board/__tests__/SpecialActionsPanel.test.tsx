// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpecialActionsPanel } from '../SpecialActionsPanel'
import type { MoorSpecialActionCardState } from '../../../../shared/moor/types'

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
  it('renders available Farmers of the Moor special actions and sends card/action ids', () => {
    const onTake = vi.fn()

    render(
      <SpecialActionsPanel
        locale="en"
        cards={cards}
        currentPlayerId="p1"
        canTakeSpecialAction={() => true}
        selected={null}
        onSelectTerrainAction={() => {}}
        onTakeImmediateAction={onTake}
      />,
    )

    expect(screen.getByText('Cut Peat')).toBeTruthy()
    expect(screen.getByText('Hiring Fair')).toBeTruthy()
    expect(screen.getByAltText('Cut Peat')).toHaveAttribute(
      'src',
      '/assets/moor/special-action-card/moor-special-cut-peat.webp',
    )
    fireEvent.click(screen.getByRole('button', { name: /Hiring Fair/ }))

    expect(onTake).toHaveBeenCalledWith('moor-special-hiring-fair', 'hiring-fair')
  })

  it('marks own face-up and face-down cards unavailable', () => {
    render(
      <SpecialActionsPanel
        locale="en"
        cards={[
          { ...cards[0]!, location: { kind: 'playerFaceUp', playerId: 'p1' } },
          { ...cards[1]!, location: { kind: 'playerFaceDown', playerId: 'p2' } },
        ]}
        currentPlayerId="p1"
        canTakeSpecialAction={() => true}
        selected={null}
        onSelectTerrainAction={() => {}}
        onTakeImmediateAction={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: /Cut Peat/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Hiring Fair/ })).toBeDisabled()
  })
})
