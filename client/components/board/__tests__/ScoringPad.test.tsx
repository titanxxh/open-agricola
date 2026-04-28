// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { PlayerScoreSummary } from '../../../../shared/logic/scoring'
import type { PlayerState } from '../../../../shared/game/types'
import { createInitialPlayerStats } from '../../../../shared/logic/stats'
import { ScoringPad } from '../ScoringPad'

const mockScores: PlayerScoreSummary[] = [
  {
    playerId: 'p1',
    playerName: 'Player 1',
    total: 1,
    categories: [
      {
        key: 'cards',
        total: 1,
        entries: [
          {
            type: 'card',
            cardId: 'A92_AdoptiveParents',
            cardType: 'occupation',
            score: 1,
          },
        ],
      },
    ],
  },
]

const mockPlayers = [
  { id: 'p1', name: 'Alice', stats: createInitialPlayerStats({ isFirstPlayer: true }) },
  { id: 'p2', name: 'Bob', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
] as unknown as PlayerState[]

describe('ScoringPad', () => {
  it('falls back to a readable card name when card translation is missing', () => {
    const html = renderToStaticMarkup(
      <ScoringPad locale="zh" scores={mockScores} players={mockPlayers} onClose={() => {}} />,
    )

    expect(html).toContain('· Adoptive Parents')
    expect(html).not.toContain('occupations.A92_AdoptiveParents.name')
  })

  it('renders Score / Stats / Draft tab buttons and Score is active by default', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Score' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stats' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Draft' })).toBeTruthy()
    // total score row visible
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
  })

  it('switches to Stats tab on click and hides total row', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.queryAllByText('Total').length).toBe(0)
  })

  it('switches to Draft tab on click', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
    expect(screen.queryAllByText('Total').length).toBe(0)
  })

  it('renders all PlayerStats fields in Stats tab', () => {
    const players = [
      {
        id: 'p1', name: 'Alice',
        stats: {
          ...createInitialPlayerStats({ isFirstPlayer: true }),
          placedFarmers: 14,
          totalRoomsBuilt: 3,
          totalMajorBuilt: 1,
          totalMinorBuilt: 2,
          totalOccupationBuilt: 3,
          harvestedGrain: 5,
          harvestedVegetable: 1,
          resourcesFromBoard: { wood: 8, clay: 3 },
          resourcesFromCards: { wood: 2 },
          resourcesConverted: { grain: 2 },
          foodFromConversion: { grain: 4 },
        },
      },
      { id: 'p2', name: 'Bob', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
    ] as unknown as PlayerState[]

    render(<ScoringPad locale="en" scores={mockScores} players={players} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.getByText('Placed farmers')).toBeTruthy()
    expect(screen.getByText('Times as first player')).toBeTruthy()
    expect(screen.getByText('Rooms built')).toBeTruthy()
    expect(screen.getByText('Major improvements')).toBeTruthy()
    expect(screen.getByText('Resources from board')).toBeTruthy()
    // numeric value 14 should appear at least once
    expect(screen.getAllByText('14').length).toBeGreaterThan(0)
  })
})
