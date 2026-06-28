// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import {
  canSubmitParentSelection,
  computeParentSelectionViewModel,
  ParentSelectionOverlay,
  type ParentSelectionViewModel,
} from '../ParentSelectionOverlay'
import type { GameState, ParentSelectionState } from '../../../../shared/contract/types'

afterEach(() => cleanup())

const mkParentSelection = (overrides: Partial<ParentSelectionState> = {}): ParentSelectionState => ({
  candidates: {
    p1: { mother: ['PR01', 'PR02'], father: ['PS01', 'PS02'] },
    p2: { mother: ['PR03', 'PR04'], father: ['PS03', 'PS04'] },
  },
  submissions: {
    p1: null,
    p2: null,
  },
  ...overrides,
})

describe('computeParentSelectionViewModel', () => {
  test('extracts local candidates and submitted count', () => {
    const vm = computeParentSelectionViewModel(mkParentSelection(), 'p1')
    expect(vm.seatCount).toBe(2)
    expect(vm.submittedCount).toBe(0)
    expect(vm.myCandidates.mother).toEqual(['PR01', 'PR02'])
    expect(vm.myCandidates.father).toEqual(['PS01', 'PS02'])
    expect(vm.alreadySubmitted).toBe(false)
    expect(vm.canSeeCandidates).toBe(true)
  })

  test('treats masked candidates as waiting-only view', () => {
    const vm = computeParentSelectionViewModel({
      candidates: {
        p1: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
        p2: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
      },
      submissions: {
        p1: null,
        p2: { mother: '?', father: '?' } as never,
      },
    }, 'p1')
    expect(vm.canSeeCandidates).toBe(false)
    expect(vm.submittedCount).toBe(1)
  })
})

describe('canSubmitParentSelection', () => {
  const baseVm: ParentSelectionViewModel = computeParentSelectionViewModel(mkParentSelection(), 'p1')

  test('requires one mother and one father from visible candidates', () => {
    expect(canSubmitParentSelection(baseVm, null, 'PS01')).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR01', null)).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR03', 'PS01')).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR01', 'PS03')).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR01', 'PS01')).toBe(true)
  })

  test('blocks resubmission', () => {
    const vm = computeParentSelectionViewModel(mkParentSelection({
      submissions: {
        p1: { mother: 'PR01', father: 'PS01' },
        p2: null,
      },
    }), 'p1')
    expect(canSubmitParentSelection(vm, 'PR02', 'PS02')).toBe(false)
  })
})

describe('ParentSelectionOverlay', () => {
  test('renders parent choices from portrait assets instead of full card images', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection(),
        players: [
          { id: 'p1', occupationHand: ['?'], minorHand: ['?'] },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      onSubmit: () => {},
    }))

    expect(screen.getByRole('img', { name: 'Mother PR01' })).toHaveAttribute(
      'src',
      '/assets/parents/portrait/PR01.png',
    )
    expect(screen.getByRole('img', { name: 'Father PS01' })).toHaveAttribute(
      'src',
      '/assets/parents/portrait/PS01.png',
    )
  })

  test('renders father requirements as compact slash summaries', () => {
    const { container } = render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection({
          candidates: {
            p1: { mother: ['PR01'], father: ['PS08'] },
            p2: { mother: ['PR03'], father: ['PS03'] },
          },
        }),
        players: [
          { id: 'p1', occupationHand: ['?'], minorHand: ['?'] },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      onSubmit: () => {},
    }))

    const conditionLine = container.querySelector('[data-card-id="PS08"] [data-kind="condition"]')
    expect(conditionLine?.textContent).toContain('at most 7 / 5 / 3 unused farmyard spaces left')
  })

  test('shows the local player already drafted occupation and minor cards', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection(),
        players: [
          {
            id: 'p1',
            occupationHand: ['A102_Grocer', 'A105_BarrowPusher'],
            minorHand: ['B034_SpecialFood'],
          },
          {
            id: 'p2',
            occupationHand: ['?'],
            minorHand: ['?'],
          },
        ],
      } as GameState,
      meId: 'p1',
      onSubmit: () => {},
    }))

    expect(screen.getByRole('heading', { name: 'Already drafted' })).toBeInTheDocument()
    expect(screen.getByText('Kept occupations (2)')).toBeInTheDocument()
    expect(screen.getByText('Kept minor improvements (1)')).toBeInTheDocument()
  })
})

describe('parent card CSS', () => {
  test('renders parent cards with the compact horizontal mock ratio', () => {
    const cssPath = join(process.cwd(), 'client/styles/pages/game.css')
    const css = readFileSync(cssPath, 'utf-8')

    expect(css).toMatch(/\.parent-card-face\s*\{[^}]*aspect-ratio:\s*735\s*\/\s*560/s)
    expect(css).toMatch(/\.parent-card-face__portrait-frame\s*\{/)
  })
})
