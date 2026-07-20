// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders available Farmers of the Moor special actions on the card image and sends card/action ids', () => {
    const onTake = vi.fn()

    const { container } = render(
      <SpecialActionsPanel
        locale="en"
        cards={cards}
        currentPlayerId="p1"
        canTakeSpecialAction={() => true}
        selected={null}
        onTakeAction={onTake}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cut Peat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hiring Fair' })).toBeTruthy()
    expect(screen.getByAltText('Cut Peat')).toHaveAttribute(
      'src',
      '/assets/moor/special-action-card/moor-special-cut-peat.webp',
    )
    expect(container.querySelector('.special-action-card__actions')).toBeNull()

    const imageAction = container.querySelector<HTMLButtonElement>(
      '.special-action-card__image-actions button[aria-label="Hiring Fair"]',
    )
    expect(imageAction).not.toBeNull()
    fireEvent.click(imageAction!)

    expect(onTake).toHaveBeenCalledWith('moor-special-hiring-fair', 'hiring-fair')
  })

  it('prefixes root asset paths with the Vite base URL', () => {
    vi.stubEnv('BASE_URL', '/open-agricola/')

    render(
      <SpecialActionsPanel
        locale="en"
        cards={[cards[0]!]}
        currentPlayerId="p1"
        canTakeSpecialAction={() => true}
        selected={null}
        onTakeAction={() => {}}
      />,
    )

    expect(screen.getByAltText('Cut Peat')).toHaveAttribute(
      'src',
      '/open-agricola/assets/moor/special-action-card/moor-special-cut-peat.webp',
    )
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
        onTakeAction={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: /Cut Peat/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Hiring Fair/ })).toBeDisabled()
  })
})
