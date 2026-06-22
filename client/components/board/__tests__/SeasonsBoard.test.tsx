// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActionSpace, Resource } from '../../../../shared/contract/types'
import { SeasonsBoard } from '../SeasonsBoard'

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

const createAction = (id: string, nameKey: string): ActionSpace => ({
  id,
  nameKey,
  descriptionKey: `${nameKey}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: resources(),
  takenBy: [],
})

describe('SeasonsBoard', () => {
  it('renders all season actions and dispatches only the available current season action', () => {
    const takeAction = vi.fn()
    const actions = [
      createAction('season-winter-romantic-evening', 'actions.season-winter-romantic-evening.name'),
      createAction('season-spring-animal-and-fruit', 'actions.season-spring-animal-and-fruit.name'),
      createAction('season-summer-farmers-market', 'actions.season-summer-farmers-market.name'),
      createAction('season-autumn-thanksgiving', 'actions.season-autumn-thanksgiving.name'),
    ]

    render(
      <SeasonsBoard
        locale="en"
        throughTheSeasons={{ startSeason: 'winter', currentSeason: 'spring' }}
        seasonActions={actions}
        canTakeAction={(space) => space.id === 'season-spring-animal-and-fruit'}
        takeAction={takeAction}
      />,
    )

    expect(screen.getByRole('button', { name: /Winter.*Romantic Evening/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Spring.*Animal and Fruit/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /Summer.*Farmer's Market/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Autumn.*Thanksgiving/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Spring.*Animal and Fruit/i }))
    fireEvent.click(screen.getByRole('button', { name: /Winter.*Romantic Evening/i }))

    expect(takeAction).toHaveBeenCalledTimes(1)
    expect(takeAction).toHaveBeenCalledWith('season-spring-animal-and-fruit')
  })
})
