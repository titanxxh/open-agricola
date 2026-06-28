// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameState, OrdinaryCardDrawChoice } from '../../../../shared/contract/types'
import { OrdinaryCardDrawOverlay } from '../OrdinaryCardDrawOverlay'
import { computeOrdinaryCardDrawViewModel } from '../ordinary-card-draw-view-model'

const choice = (
  id: string,
  playerId: string,
  cardType: OrdinaryCardDrawChoice['cardType'],
  candidates: string[],
): OrdinaryCardDrawChoice => ({
  id,
  playerId,
  cardType,
  candidates,
  sourceCard: 'PS03',
})

const stateWithChoices = (
  choices: Record<string, OrdinaryCardDrawChoice>,
): GameState => ({
  ordinaryCardDrawChoices: choices,
} as GameState)

describe('computeOrdinaryCardDrawViewModel', () => {
  it('filters to the local player and orders queued choices by sequence', () => {
    const vm = computeOrdinaryCardDrawViewModel({
      'ordinary-card-draw-11': choice('ordinary-card-draw-11', 'p1', 'minor', ['E042_WaterGully']),
      'ordinary-card-draw-2': choice('ordinary-card-draw-2', 'p1', 'occupation', ['E164_MountainPlowman']),
      'ordinary-card-draw-1': choice('ordinary-card-draw-1', 'p2', 'minor', ['E025_BumperCrop']),
    }, 'p1')

    expect(vm.queueLength).toBe(2)
    expect(vm.choice?.id).toBe('ordinary-card-draw-2')
  })
})

describe('OrdinaryCardDrawOverlay', () => {
  it('renders the local draw candidates and submits the kept card', () => {
    const onKeep = vi.fn()
    render(
      <OrdinaryCardDrawOverlay
        state={stateWithChoices({
          'ordinary-card-draw-3': choice('ordinary-card-draw-3', 'p1', 'occupation', [
            'E164_MountainPlowman',
            'E105_Pioneer',
            'E113_Godmother',
          ]),
        })}
        playerId="p1"
        locale="en"
        onKeep={onKeep}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Ordinary card draw choice' })).toBeInTheDocument()
    expect(screen.getByText('Keep 1 Occupation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep E105_Pioneer' }))
    expect(onKeep).toHaveBeenCalledWith('ordinary-card-draw-3', 'E105_Pioneer')
  })

  it('does not reveal another player draw choice', () => {
    const { container } = render(
      <OrdinaryCardDrawOverlay
        state={stateWithChoices({
          'ordinary-card-draw-4': choice('ordinary-card-draw-4', 'p2', 'minor', ['E042_WaterGully']),
        })}
        playerId="p1"
        locale="en"
        onKeep={() => {}}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
