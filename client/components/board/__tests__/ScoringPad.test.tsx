// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { PlayerScoreSummary } from '../../../../shared/domain/scoring'
import type { PlayerState } from '../../../../shared/contract/types'
import { createInitialPlayerStats } from '../../../../shared/session/stats'
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

const scoreRowsWithCardBonuses = [
  {
    playerId: 'p1',
    playerName: 'Player 1',
    total: 12,
    categories: [
      {
        key: 'cards',
        total: 2,
        entries: [
          { type: 'card', cardId: 'Major_Pottery', cardType: 'major', score: 2 },
          { type: 'card', cardId: 'A37_Bucksaw', cardType: 'minor', score: 0 },
        ],
      },
      {
        key: 'cardBonusVp',
        total: 7,
        entries: [
          {
            type: 'bonus',
            cardId: 'A136_DrudgeryReeve',
            cardType: 'occupation',
            score: 3,
            reserved: { wood: 3, clay: 3, reed: 3, stone: 3 },
          },
          {
            type: 'bonus',
            cardId: 'A136_DrudgeryReeve',
            cardType: 'occupation',
            score: 2,
          },
          {
            type: 'bonus',
            cardId: 'Major_Pottery',
            cardType: 'major',
            score: 2,
            reserved: { clay: 2 },
          },
          {
            type: 'bonus',
            cardId: 'E159_OldMiser',
            cardType: 'occupation',
            score: -3,
          },
          {
            type: 'bonus',
            cardId: 'A37_Bucksaw',
            cardType: 'minor',
            score: 0,
          },
        ],
      },
      {
        key: 'cardsBonus',
        total: 4,
        entries: [
          { type: 'bonus', cardId: 'A37_Bucksaw', cardType: 'minor', score: 4 },
        ],
      },
      {
        key: 'cardStateBonusVp',
        total: 1,
        entries: [
          { type: 'bonus', cardId: 'B48_ForestStone', cardType: 'minor', score: 1 },
        ],
      },
    ],
  },
  {
    playerId: 'p2',
    playerName: 'Player 2',
    total: 0,
    categories: [
      {
        key: 'cardBonusVp',
        total: 0,
        entries: [
          {
            type: 'bonus',
            cardId: 'A136_DrudgeryReeve',
            cardType: 'occupation',
            score: 0,
          },
        ],
      },
    ],
  },
] as unknown as PlayerScoreSummary[]

const scoringRowContaining = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('.scoring-row')).find((row) =>
    row.textContent?.includes(text),
  )

describe('ScoringPad', () => {
  it('falls back to a readable card name when card translation is missing', () => {
    const html = renderToStaticMarkup(
      <ScoringPad locale="zh" scores={mockScores} players={mockPlayers} onClose={() => {}} />,
    )

    expect(html).toContain('Adoptive Parents')
    expect(html).not.toContain('occupations.A92_AdoptiveParents.name')
  })

  it('hides Draft tab during the game and Score is active by default', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Score' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stats' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Draft' })).toBeNull()
    // total score row visible
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
  })

  it('switches to Stats tab on click and hides total row', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.queryAllByText('Total').length).toBe(0)
  })

  it('switches to Draft tab on click', () => {
    render(<ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} showDraftHistory />)
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
    expect(screen.queryAllByText('Total').length).toBe(0)
  })

  it('renders draft history per player with played turns', () => {
    const players = [
      {
        id: 'p1', name: 'Alice',
        stats: {
          ...createInitialPlayerStats({ isFirstPlayer: true }),
          draftHistory: [
            { cardId: 'A92_AdoptiveParents', draftTurn: 1, playedTurn: 3 },
            { cardId: 'B79_Corf', draftTurn: 2 },
          ],
          draftDiscarded: ['D1_Foo'],
        },
      },
      { id: 'p2', name: 'Bob', stats: createInitialPlayerStats({ isFirstPlayer: false }) },
    ] as unknown as PlayerState[]

    render(<ScoringPad locale="en" scores={mockScores} players={players} onClose={() => {}} showDraftHistory />)
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }))

    // Alice's two picks should appear (rendered by getAnyCardDisplayName)
    expect(screen.getByText(/Adoptive Parents/)).toBeTruthy()
    expect(screen.getByText(/Corf/)).toBeTruthy()
    // Discarded section appears for Alice
    expect(screen.getByText(/Discarded/)).toBeTruthy()
    // Played turn label appears for the entry that was played
    expect(screen.getByText(/T3/)).toBeTruthy()
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

  it('renders one card bonus category with merged non-zero attributed child rows', () => {
    const { container } = render(
      <ScoringPad
        locale="en"
        scores={scoreRowsWithCardBonuses}
        players={mockPlayers}
        onClose={() => {}}
      />,
    )

    expect(screen.getAllByText('Card bonus')).toHaveLength(1)
    expect(screen.getByText('Cards')).toBeTruthy()
    expect(screen.queryByText('Improvements')).toBeNull()
    expect(screen.queryByText('Bucksaw')).toBeNull()
    expect(screen.queryByText('Forest Stone')).toBeNull()

    expect(screen.getAllByText('Drudgery Reeve')).toHaveLength(1)
    const drudgeryRow = scoringRowContaining(container, 'Drudgery Reeve')
    expect(drudgeryRow?.textContent).toContain('+5')
    expect(drudgeryRow?.textContent).toContain('0')
    expect(drudgeryRow?.textContent).not.toContain('wood')
    expect(drudgeryRow?.textContent).not.toContain('clay')
    expect(drudgeryRow?.querySelector('.scoring-cell-detail')).toBeNull()

    const potteryRows = Array.from(container.querySelectorAll('.scoring-row')).filter((row) =>
      row.textContent?.includes('Pottery'),
    )
    expect(potteryRows).toHaveLength(2)
  })

  it('renders negative attributed card bonus child rows', () => {
    const { container } = render(
      <ScoringPad
        locale="en"
        scores={scoreRowsWithCardBonuses}
        players={mockPlayers}
        onClose={() => {}}
      />,
    )

    const oldMiserRow = scoringRowContaining(container, 'Old Miser')
    expect(oldMiserRow?.textContent).toContain('-3')
    expect(oldMiserRow?.textContent).toContain('0')
  })

  it('uses the action log card reference affordance for card bonus child labels', () => {
    const { container } = render(
      <ScoringPad
        locale="en"
        scores={scoreRowsWithCardBonuses}
        players={mockPlayers}
        onClose={() => {}}
      />,
    )

    const drudgeryLink = screen.getByText('Drudgery Reeve')
    expect(drudgeryLink.classList.contains('log-card-link')).toBe(true)
    expect(drudgeryLink.getAttribute('tabindex')).toBe('0')

    fireEvent.focus(drudgeryLink)
    expect(container.querySelector('.log-card-tooltip')).not.toBeNull()
    fireEvent.blur(drudgeryLink)
    expect(container.querySelector('.log-card-tooltip')).toBeNull()
  })

  it('uses the action log card reference affordance for printed card child labels', () => {
    const { container } = render(
      <ScoringPad locale="en" scores={mockScores} players={mockPlayers} onClose={() => {}} />,
    )

    const cardRow = scoringRowContaining(container, 'Adoptive Parents')
    const cardLink = cardRow?.querySelector('.log-card-link')
    expect(cardLink).toBeInstanceOf(HTMLElement)
    if (!(cardLink instanceof HTMLElement)) throw new Error('missing card link')
    expect(cardLink.getAttribute('tabindex')).toBe('0')

    fireEvent.focus(cardLink)
    expect(container.querySelector('.log-card-tooltip')).not.toBeNull()
    fireEvent.blur(cardLink)
    expect(container.querySelector('.log-card-tooltip')).toBeNull()
  })

  it('keeps child-row bullets and card names in the same label wrapper', () => {
    const { container } = render(
      <ScoringPad
        locale="en"
        scores={scoreRowsWithCardBonuses}
        players={mockPlayers}
        onClose={() => {}}
      />,
    )

    const drudgeryRow = scoringRowContaining(container, 'Drudgery Reeve')
    const label = drudgeryRow?.querySelector('.scoring-label')
    expect(label?.childNodes).toHaveLength(1)
    expect(label?.textContent).toContain('· Drudgery Reeve')
  })

  it('uses resilient card names for card bonus child labels', () => {
    render(
      <ScoringPad
        locale="zh"
        scores={scoreRowsWithCardBonuses}
        players={mockPlayers}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText('苦役监工')).toBeInTheDocument()
    expect(screen.queryByText('Drudgery Reeve')).toBeNull()
  })
})
