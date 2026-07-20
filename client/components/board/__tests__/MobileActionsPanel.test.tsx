// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActionSpace } from '../../../../shared/contract/types'
import { emptyResources } from '../../../../shared/contract/state-constants'
import type { MoorSpecialActionCardState } from '../../../../shared/moor/types'
import { MobileActionsPanel } from '../MobileActionsPanel'

const action = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: { ...emptyResources },
  takenBy: [],
})

describe('MobileActionsPanel', () => {
  it('presents revealed base and round actions through the supplied availability and command seam', () => {
    const takeAction = vi.fn()
    const meetingPlace = action('meeting-place')
    meetingPlace.resources.wood = 3
    const lessons = action('lessons')
    const improvement = action('improvement')
    const futureAction = action('fencing')

    render(
      <MobileActionsPanel
        locale="en"
        baseActions={[meetingPlace, lessons]}
        roundSlots={[
          { round: 1, action: improvement },
          { round: 2, action: futureAction },
        ]}
        currentRound={1}
        devMode={false}
        canTakeAction={(space) => space.id === meetingPlace.id}
        takeAction={takeAction}
      />,
    )

    const available = screen.getByRole('button', { name: /Meeting Place/ })
    expect(available).toBeEnabled()
    expect(available).toHaveTextContent('Wood 3')
    expect(screen.getByRole('button', { name: /Lessons/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Improvement/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Fencing/ })).not.toBeInTheDocument()

    fireEvent.click(available)

    expect(takeAction).toHaveBeenCalledWith(meetingPlace)
  })

  it('keeps every Through the Seasons action readable and submits the available one', () => {
    const takeSeasonAction = vi.fn()
    const winter = action('season-winter-romantic-evening')
    const spring = action('season-spring-animal-and-fruit')
    const summer = action('season-summer-farmers-market')
    const autumn = action('season-autumn-thanksgiving')

    render(
      <MobileActionsPanel
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentRound={1}
        devMode={false}
        canTakeAction={(space) => space.id === spring.id}
        takeAction={() => {}}
        seasonActions={[winter, spring, summer, autumn]}
        takeSeasonAction={takeSeasonAction}
      />,
    )

    expect(screen.getByRole('button', { name: /Romantic Evening/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Animal and Fruit/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Farmer's Market/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Thanksgiving/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Animal and Fruit/ }))

    expect(takeSeasonAction).toHaveBeenCalledWith(spring.id)
  })

  it('shows Farmers of the Moor card art and routes each special action through its supplied command', () => {
    const takeSpecialAction = vi.fn()
    const card: MoorSpecialActionCardState = {
      id: 'moor-special-mixed',
      players: [2, 3, 4, 5, 6],
      actions: ['cut-peat', 'hiring-fair'],
      image: '/assets/moor/special-action-card/moor-special-mixed.webp',
      location: { kind: 'market' },
    }

    render(
      <MobileActionsPanel
        locale="en"
        baseActions={[]}
        roundSlots={[]}
        currentRound={1}
        devMode={false}
        canTakeAction={() => false}
        takeAction={() => {}}
        specialActions={{
          cards: [card],
          canTake: (_card, actionId) => actionId === 'cut-peat' || actionId === 'hiring-fair',
          selected: null,
          onTake: takeSpecialAction,
        }}
      />,
    )

    expect(screen.getByAltText('Cut Peat / Hiring Fair')).toHaveAttribute(
      'src',
      '/assets/moor/special-action-card/moor-special-mixed.webp',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cut Peat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hiring Fair' }))

    expect(takeSpecialAction).toHaveBeenNthCalledWith(1, card.id, 'cut-peat')
    expect(takeSpecialAction).toHaveBeenNthCalledWith(2, card.id, 'hiring-fair')
  })

  it('keeps base, combined expansions, major improvements, and optional board orientation together', () => {
    const meetingPlace = action('meeting-place')
    const spring = action('season-spring-animal-and-fruit')
    const card: MoorSpecialActionCardState = {
      id: 'moor-special-hiring-fair',
      players: [2, 3, 4, 5, 6],
      actions: ['hiring-fair'],
      image: '/assets/moor/special-action-card/moor-special-hiring-fair.webp',
      location: { kind: 'market' },
    }

    const { container } = render(
      <MobileActionsPanel
        locale="en"
        baseActions={[meetingPlace]}
        roundSlots={[]}
        currentRound={1}
        devMode={false}
        canTakeAction={() => true}
        takeAction={() => {}}
        seasonActions={[spring]}
        takeSeasonAction={() => {}}
        specialActions={{
          cards: [card],
          canTake: () => true,
          selected: null,
          onTake: () => {},
        }}
        majorImprovements={<button type="button">Major Well</button>}
        boardOverview={<div>Physical action board</div>}
      />,
    )

    expect(screen.getByRole('button', { name: /Meeting Place/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Animal and Fruit/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Hiring Fair' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Major Well' })).toBeEnabled()
    const overview = container.querySelector('.mobile-board-overview')
    expect(screen.getByText('Board overview').tagName).toBe('SUMMARY')
    expect(overview).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Board overview'))
    expect(overview).toHaveAttribute('open')
    expect(screen.getByText('Physical action board')).toBeInTheDocument()
  })
})
