// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActionSpace, PlayerState, Resource } from '../../../../shared/contract/types'
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

const createPlayer = (id: string, name: string, color: PlayerState['color']): PlayerState => ({
  id,
  name,
  color,
  resources: resources(),
  workers: [{ id: '1', isActive: true, isNewborn: false }],
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
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

describe('SeasonsBoard', () => {
  it.each([['winter', '冬'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋']] as const)(
    'localizes the %s season token', (season, label) => {
      const { container } = render(<SeasonsBoard locale="zh"
        throughTheSeasons={{ startSeason: season, currentSeason: season }}
        seasonActions={[]} players={[]} canTakeAction={() => false} takeAction={vi.fn()} />)
      expect(container.querySelector('.seasons-board__token')).toHaveTextContent(label)
    },
  )

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
        players={[createPlayer('p1', 'Red player', 'red')]}
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

  it('renders a clean-background seasons board without extra summary panels', () => {
    const actions = [
      createAction('season-winter-romantic-evening', 'actions.season-winter-romantic-evening.name'),
      createAction('season-spring-animal-and-fruit', 'actions.season-spring-animal-and-fruit.name'),
      createAction('season-summer-farmers-market', 'actions.season-summer-farmers-market.name'),
      createAction('season-autumn-thanksgiving', 'actions.season-autumn-thanksgiving.name'),
    ]
    actions[2]!.takenBy = [{ playerId: 'p2', workerId: '1' }]

    const { container } = render(
      <SeasonsBoard
        locale="en"
        throughTheSeasons={{ startSeason: 'winter', currentSeason: 'summer' }}
        seasonActions={actions}
        players={[
          createPlayer('p1', 'Red player', 'red'),
          createPlayer('p2', 'Blue player', 'blue'),
        ]}
        canTakeAction={(space) => space.id === 'season-summer-farmers-market'}
        takeAction={() => {}}
      />,
    )

    expect(container.querySelector('.seasons-board__map')).toHaveAttribute('data-board-art', 'clean-background')
    expect(container.querySelector('.seasons-board__art')).toBeNull()
    expect(container.querySelectorAll('.seasons-board__cutout-image')).toHaveLength(0)
    expect(container.querySelectorAll('.seasons-board__season-action-card')).toHaveLength(4)
    expect(container.querySelectorAll('.seasons-board__resource-adjustment')).toHaveLength(10)
    expect(container.querySelector('.seasons-board__space-button--winter .res-icon-child-free')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--spring .res-icon-sow')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--summer .res-icon-bake')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--autumn .res-icon-vegetable')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--winter .seasons-board__winter-family')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--spring .seasons-board__spring-text')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--summer .seasons-board__summer-market')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--autumn .seasons-board__autumn-vegetable')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--winter .seasons-board__action-header')).toHaveTextContent('Romantic Evening')
    expect(container.querySelector('.seasons-board__space-button--spring .seasons-board__action-header')).toHaveTextContent('Animal and Fruit')
    expect(container.querySelector('.seasons-board__space-button--summer .seasons-board__action-header')).toHaveTextContent("Farmer's Market")
    expect(container.querySelector('.seasons-board__space-button--autumn .seasons-board__action-header')).toHaveTextContent('Thanksgiving')
    expect(container.querySelectorAll('.seasons-board__action-footer')).toHaveLength(4)
    expect(container.querySelector('.seasons-board__resource-adjustment--winter-basic .res-icon-clay')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--winter-basic .res-icon-wood')).toBeNull()
    expect(container.querySelector('.seasons-board__resource-adjustment--winter-plow')).toHaveTextContent('plowing a field:')
    expect(container.querySelector('.seasons-board__resource-adjustment--winter-plow .res-icon-food')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--winter-plow .seasons-board__icon-arrow')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--winter-plow .res-icon-field')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--spring-basic .res-icon-stone')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--summer-fishing .res-icon-food')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--summer-day-laborer .res-icon-grain')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--autumn-basic .res-icon-wood')).toBeTruthy()
    expect(container.querySelector('.seasons-board__resource-adjustment--autumn-major .res-icon-reed')).toBeTruthy()
    expect(container.querySelectorAll('.seasons-board__accumulation-arrow')).toHaveLength(4)
    expect(container.querySelectorAll('.seasons-board__resource-adjustment--autumn-major .seasons-board__icon-separator')).toHaveLength(3)
    expect(container.querySelector('.seasons-board__space-button--winter')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--spring')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--summer')).toBeTruthy()
    expect(container.querySelector('.seasons-board__space-button--autumn')).toBeTruthy()
    expect(container.querySelector('.seasons-board__token')).toHaveTextContent('S')
    expect(container.querySelector('.seasons-board__space-button--summer')).toHaveClass('is-current')
    expect(container.querySelector('[data-season-status="occupied"]')).toHaveTextContent('occupied')
    expect(container.querySelectorAll('[data-season-status="locked"]')).toHaveLength(3)
    expect(screen.queryByRole('heading', { name: 'Summer' })).not.toBeInTheDocument()
    expect(screen.queryByText("Farmer's Market is the active special action.")).not.toBeInTheDocument()
    expect(screen.queryByText('Season flow')).not.toBeInTheDocument()
    expect(screen.queryByText(/One seasonal action is exposed each round/i)).not.toBeInTheDocument()
  })

  it('localizes the visible seasons board copy in Chinese', () => {
    const actions = [
      createAction('season-winter-romantic-evening', 'actions.season-winter-romantic-evening.name'),
      createAction('season-spring-animal-and-fruit', 'actions.season-spring-animal-and-fruit.name'),
      createAction('season-summer-farmers-market', 'actions.season-summer-farmers-market.name'),
      createAction('season-autumn-thanksgiving', 'actions.season-autumn-thanksgiving.name'),
    ]

    const { container } = render(
      <SeasonsBoard
        locale="zh"
        throughTheSeasons={{ startSeason: 'winter', currentSeason: 'winter' }}
        seasonActions={actions}
        players={[createPlayer('p1', '红方', 'red')]}
        canTakeAction={(space) => space.id === 'season-winter-romantic-evening'}
        takeAction={() => {}}
      />,
    )

    expect(container.querySelector('.seasons-board__map')).toHaveAttribute('data-board-art', 'clean-background')
    expect(container.querySelector('.seasons-board__art')).toBeNull()
    expect(container.querySelectorAll('.seasons-board__cutout-image')).toHaveLength(0)
    expect(container.querySelector('.seasons-board__space-button--winter .seasons-board__action-header')).toHaveTextContent('浪漫夜晚')
    expect(screen.getByText('家中无空房也可')).toBeInTheDocument()
    expect(screen.getByText('犁一块田：')).toBeInTheDocument()
    expect(screen.queryByText('季节流程')).not.toBeInTheDocument()
    expect(screen.queryByText(/浪漫夜晚。犁田需要 1 食物/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Romantic Evening\. Plow costs/)).not.toBeInTheDocument()
  })
})
