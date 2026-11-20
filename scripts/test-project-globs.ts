import { defaultExclude } from 'vitest/config'

const BASE_DEFAULT_EXCLUDE = defaultExclude.filter(pattern =>
  pattern !== '**/.worktree/**' && pattern !== '.worktree/**')
const isInsideWorktree = process.cwd().split(/[\\/]/).includes('.worktree')

export const SLOW_INCLUDE = [
  'server/__tests__/[A-E][0-9]*_*-session.test.ts',
  'server/__tests__/M[0-9]*_*-session.test.ts',
]
export const BASE_EXCLUDE = isInsideWorktree
  ? BASE_DEFAULT_EXCLUDE
  : [...BASE_DEFAULT_EXCLUDE, '.worktree/**']
export const FAST_EXCLUDE = [...BASE_EXCLUDE, ...SLOW_INCLUDE]

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
// Heavy tooling tests that run release, deployment and CI CLIs end to end: each case builds a temporary repository,
// installs gh/ssh/docker stubs and spawns tsx, git or bash there (or replays the real repository plan). Each file
// takes at least 10 s on a GitHub runner, so they run in the slow task beside the card Session tests to keep the
// fast task short (#1929). The list is explicit on purpose; new tooling tests stay in fast-scripts by default.
export const SLOW_SCRIPTS_INCLUDE = [
  'scripts/__tests__/backend-image-maintenance-bootstrap.test.ts',
  'scripts/__tests__/backend-image-maintenance-compose-binding.test.ts',
  'scripts/__tests__/backend-image-maintenance-delivery.test.ts',
  'scripts/__tests__/backend-image-maintenance-owner-cutover.test.ts',
  'scripts/__tests__/backend-image-maintenance-recovery.test.ts',
  'scripts/__tests__/backend-image-maintenance-resume.test.ts',
  'scripts/__tests__/backend-image-receiver.test.ts',
  'scripts/__tests__/backup-storage.test.ts',
  'scripts/__tests__/candidate-verification-cli.test.ts',
  'scripts/__tests__/candidate-verification-isolation.test.ts',
  'scripts/__tests__/candidate-verification-pages.test.ts',
  'scripts/__tests__/candidate-verification-prerelease.test.ts',
  'scripts/__tests__/prerelease-image-import.test.ts',
  'scripts/__tests__/prerelease-operations.test.ts',
  'scripts/__tests__/release-owner-local.test.ts',
  'scripts/__tests__/release-publish.test.ts',
  'scripts/__tests__/restart-local-processes.test.ts',
  'scripts/__tests__/routine-verification-plan.test.ts',
  'scripts/__tests__/routine-verification-replay.test.ts',
  'scripts/__tests__/scenario-evidence.test.ts',
  'scripts/__tests__/scoped-verification-cli.test.ts',
  'scripts/__tests__/storage-archive.test.ts',
  'scripts/__tests__/verification-requirements.test.ts',
  'scripts/__tests__/verify-feedback-deployment.test.ts',
]
export const FAST_SCRIPTS_EXCLUDE = [...FAST_EXCLUDE, ...SLOW_SCRIPTS_INCLUDE]
export const FAST_TESTS_INCLUDE = ['tests/**/*.test.ts']

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
    exclude: FAST_SCRIPTS_EXCLUDE,
  },
  {
    name: 'fast-tests',
    include: FAST_TESTS_INCLUDE,
    exclude: FAST_EXCLUDE,
  },
]

export const SLOW_PROJECT_GLOBS: TestProjectGlob[] = [
  { name: 'slow', include: SLOW_INCLUDE, exclude: BASE_EXCLUDE },
  { name: 'slow-scripts', include: SLOW_SCRIPTS_INCLUDE, exclude: BASE_EXCLUDE },
]

export const TEST_PROJECT_GLOBS: TestProjectGlob[] = [...FAST_PROJECT_GLOBS, ...SLOW_PROJECT_GLOBS]
