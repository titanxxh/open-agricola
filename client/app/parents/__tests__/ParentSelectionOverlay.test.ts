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
import { publicAssetUrl } from '../../../utils/public-asset-url'

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
  test('preserves the active parent selection flow in English', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection(),
        players: [
          {
            id: 'p1',
            occupationHand: ['A102_Grocer'],
            minorHand: ['B034_SpecialFood'],
          },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      locale: 'en',
      onSubmit: () => {},
    }))

    expect(screen.getByRole('dialog', { name: 'Parent Cards selection' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parent Cards' })).toBeInTheDocument()
    expect(screen.getByText('Choose 1 mother and 1 father.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mother' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Father' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm parents' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Already drafted' })).toBeInTheDocument()
  })

  test('preserves the submitted parent selection state in English', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection({
          submissions: {
            p1: { mother: 'PR01', father: 'PS01' },
            p2: null,
          },
        }),
        players: [
          { id: 'p1', occupationHand: ['?'], minorHand: ['?'] },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      locale: 'en',
      onSubmit: () => {},
    }))

    expect(screen.getByText('Waiting for other players (1/2)...')).toBeInTheDocument()
    expect(screen.getByText('Parent Cards selection submitted.')).toBeInTheDocument()
  })

  test('preserves the private candidate waiting state in English', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection({
          candidates: {
            p1: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
            p2: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
          },
        }),
        players: [
          { id: 'p1', occupationHand: ['?'], minorHand: ['?'] },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      locale: 'en',
      onSubmit: () => {},
    }))

    expect(screen.getByText('Waiting for your private Parent Cards candidates.')).toBeInTheDocument()
  })

  test('localizes the active parent selection flow in Chinese', () => {
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
      locale: 'zh',
      onSubmit: () => {},
    }))

    expect(screen.getByRole('dialog', { name: '父母卡选择' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '父母卡' })).toBeInTheDocument()
    expect(screen.getByText('选择 1 张母亲卡和 1 张父亲卡。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '母亲' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '父亲' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认父母卡' })).toBeInTheDocument()
  })

  test('passes the Chinese locale to parent card choices', () => {
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
      locale: 'zh',
      onSubmit: () => {},
    }))

    expect(screen.getByRole('img', { name: '母亲 PR01' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '父亲 PS01' })).toBeInTheDocument()
  })

  test('localizes the submitted parent selection state in Chinese', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection({
          submissions: {
            p1: { mother: 'PR01', father: 'PS01' },
            p2: null,
          },
        }),
        players: [
          { id: 'p1', occupationHand: ['?'], minorHand: ['?'] },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      locale: 'zh',
      onSubmit: () => {},
    }))

    expect(screen.getByText('等待其他玩家（1/2）…')).toBeInTheDocument()
    expect(screen.getByText('已提交父母卡选择。')).toBeInTheDocument()
  })

  test('localizes the private candidate waiting state in Chinese', () => {
    render(createElement(ParentSelectionOverlay, {
      state: {
        phase: 'parent-selection',
        gameSeed: 1,
        parentSelection: mkParentSelection({
          candidates: {
            p1: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
            p2: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
          },
        }),
        players: [
          { id: 'p1', occupationHand: ['?'], minorHand: ['?'] },
          { id: 'p2', occupationHand: ['?'], minorHand: ['?'] },
        ],
      } as GameState,
      meId: 'p1',
      locale: 'zh',
      onSubmit: () => {},
    }))

    expect(screen.getByText('等待你的私有父母卡候选。')).toBeInTheDocument()
  })

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
      publicAssetUrl('/assets/parents/portrait/PR01.png'),
    )
    expect(screen.getByRole('img', { name: 'Father PS01' })).toHaveAttribute(
      'src',
      publicAssetUrl('/assets/parents/portrait/PS01.png'),
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

  test('localizes the selected card history in Chinese', () => {
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
      locale: 'zh',
      onSubmit: () => {},
    }))

    expect(screen.getByRole('heading', { name: '已选卡牌' })).toBeInTheDocument()
    expect(screen.getByText('已选职业（2）')).toBeInTheDocument()
    expect(screen.getByText('已选小改进（1）')).toBeInTheDocument()
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
