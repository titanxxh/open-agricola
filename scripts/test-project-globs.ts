import { defaultExclude } from 'vitest/config'

const BASE_DEFAULT_EXCLUDE = defaultExclude.filter(pattern =>
  pattern !== '**/.worktree/**' && pattern !== '.worktree/**')
const isInsideWorktree = process.cwd().split(/[\\/]/).includes('.worktree')

export const SLOW_INCLUDE = [
  'server/__tests__/[A-E][0-9]*_*-session.test.ts',
  'server/__tests__/M[0-9]*_*-session.test.ts',
]
export const LLM_GLOB = 'tests/llm-card-gen/**'
export const LLM_INCLUDE = ['tests/llm-card-gen/**/*.test.ts']
export const BASE_EXCLUDE = isInsideWorktree
  ? BASE_DEFAULT_EXCLUDE
  : [...BASE_DEFAULT_EXCLUDE, '.worktree/**']
export const SHARED_EXCLUDE = [...BASE_EXCLUDE, LLM_GLOB]
export const FAST_EXCLUDE = [...SHARED_EXCLUDE, ...SLOW_INCLUDE]

export const FAST_SHARED_INCLUDE = [
  'shared/**/*.test.ts',
  'shared/**/*.test.tsx',
]

export const FAST_SHARED_EXCLUDE = [
  ...FAST_EXCLUDE,
  'shared/cards/**',
  'shared/actions/effects/**',
  'shared/session/**',
  'shared/domain/__tests__/scoring*.test.ts',
  'shared/actions/helpers/__tests__/placement-availability.test.ts',
  'shared/actions/__tests__/animal-zones-card-hook.test.ts',
]

export const FAST_CARDS_INCLUDE = [
  'shared/cards/**/*.test.ts',
  'shared/cards/**/*.test.tsx',
]

export const FAST_CARD_RUNTIME_INCLUDE = [
  'shared/actions/effects/**/*.test.ts',
  'shared/session/**/*.test.ts',
  'shared/domain/__tests__/scoring*.test.ts',
  'shared/actions/helpers/__tests__/placement-availability.test.ts',
  'shared/actions/__tests__/animal-zones-card-hook.test.ts',
]

export const FAST_CLIENT_INCLUDE = [
  'client/**/*.test.ts',
  'client/**/*.test.tsx',
]

export const FAST_SERVER_INCLUDE = [
  'server/__tests__/*.test.ts',
  'server/game/**/__tests__/*.test.ts',
  'server/connection/**/__tests__/*.test.ts',
  'server/oauth/**/__tests__/*.test.ts',
  'server/workshop-pr/__tests__/*.test.ts',
]

export const FAST_SCRIPTS_INCLUDE = ['scripts/**/__tests__/*.test.ts']
export const FAST_TESTS_INCLUDE = ['tests/**/*.test.ts']
export const FAST_TESTS_EXCLUDE = [...FAST_EXCLUDE, LLM_GLOB]

export type TestProjectGlob = {
  name: string
  include: string[]
  exclude: string[]
}

export const FAST_PROJECT_GLOBS: TestProjectGlob[] = [
  {
    name: 'fast-shared',
    include: FAST_SHARED_INCLUDE,
    exclude: FAST_SHARED_EXCLUDE,
  },
  { name: 'fast-cards', include: FAST_CARDS_INCLUDE, exclude: FAST_EXCLUDE },
  {
    name: 'fast-card-runtime',
    include: FAST_CARD_RUNTIME_INCLUDE,
    exclude: FAST_EXCLUDE,
  },
  { name: 'fast-client', include: FAST_CLIENT_INCLUDE, exclude: FAST_EXCLUDE },
  { name: 'fast-server', include: FAST_SERVER_INCLUDE, exclude: FAST_EXCLUDE },
  {
    name: 'fast-scripts',
    include: FAST_SCRIPTS_INCLUDE,
    exclude: FAST_EXCLUDE,
  },
  {
    name: 'fast-tests',
    include: FAST_TESTS_INCLUDE,
    exclude: FAST_TESTS_EXCLUDE,
  },
]
