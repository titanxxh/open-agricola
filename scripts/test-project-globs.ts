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
// Two PostgreSQL-heavy storage tests run in the slow task beside the card Session tests, so the fast task stays short
// (#1929). Both stay in release verification because the candidate's own code runs them in production: the
// candidate image runs `storage-archive-cli`, and backups run from the checkout switched to the candidate (#1950).
export const SLOW_SCRIPTS_INCLUDE = [
  'scripts/__tests__/backup-storage.test.ts',
  'scripts/__tests__/storage-archive.test.ts',
]

// Release, deployment, CI-planning and local-development tooling tests (#1950, #1952). Release verification
// (`test:fast`, `test:slow`) does not run them: at release time the trusted producer on main runs this tooling, not
// the candidate, and the candidate's copy only runs once it has become the producer after its own PR Routine. Routine
// runs the files that its dependencies or `@covers` select, and the whole project whenever it falls back to the
// complete catalog. Tests whose code the candidate itself runs in production stay in fast-scripts or slow-scripts.
export const TOOLING_INCLUDE = [
  // Release, deployment and backup.
  'scripts/__tests__/backend-image-cleanup.test.ts',
  'scripts/__tests__/backend-image-cli.test.ts',
  'scripts/__tests__/backend-image-maintenance-bootstrap.test.ts',
  'scripts/__tests__/backend-image-maintenance-compose-binding.test.ts',
  'scripts/__tests__/backend-image-maintenance-delivery.test.ts',
  'scripts/__tests__/backend-image-maintenance-owner-cutover.test.ts',
  'scripts/__tests__/backend-image-maintenance-recovery.test.ts',
  'scripts/__tests__/backend-image-maintenance-resume.test.ts',
  'scripts/__tests__/backend-image-receiver.test.ts',
  'scripts/__tests__/backend-image-validator.test.ts',
  'scripts/__tests__/backup-files.test.ts',
  'scripts/__tests__/container-images-archive.test.ts',
  'scripts/__tests__/container-images.test.ts',
  'scripts/__tests__/live-acceptance-login-budget.test.ts',
  'scripts/__tests__/live-acceptance-rebind.test.ts',
  'scripts/__tests__/live-acceptance-source-recovery.test.ts',
  'scripts/__tests__/live-acceptance-source-update.test.ts',
  'scripts/__tests__/live-acceptance-window.test.ts',
  'scripts/__tests__/live-acceptance.test.ts',
  'scripts/__tests__/live-smoke-inventory.test.ts',
  'scripts/__tests__/live-smoke.test.ts',
  'scripts/__tests__/operations-deployment.test.ts',
  'scripts/__tests__/owner-backup.test.ts',
  'scripts/__tests__/owner-cutover.test.ts',
  'scripts/__tests__/prerelease-*.test.ts',
  'scripts/__tests__/release-owner-local.test.ts',
  'scripts/__tests__/release-publish.test.ts',
  'scripts/__tests__/release-session-cleanup.test.ts',
  'scripts/__tests__/release-smoke.test.ts',
  'scripts/__tests__/release-status.test.ts',
  'scripts/__tests__/validator-image.test.ts',
  'scripts/__tests__/verify-feedback-deployment.test.ts',
  // Candidate verification and CI planning.
  'scripts/__tests__/browser-extended-matrix.test.ts',
  'scripts/__tests__/candidate-verification-*.test.ts',
  'scripts/__tests__/candidate-verification.test.ts',
  'scripts/__tests__/catalog-chromium-balance.test.ts',
  'scripts/__tests__/isolated-browser.test.ts',
  'scripts/__tests__/owner-local-image-cache.test.ts',
  'scripts/__tests__/owner-local-run.test.ts',
  'scripts/__tests__/routine-verification-*.test.ts',
  'scripts/__tests__/scoped-verification-*.test.ts',
  'scripts/__tests__/scoped-verification.test.ts',
  'scripts/__tests__/test-consumers.test.ts',
  'scripts/__tests__/verification-plan.test.ts',
  'scripts/__tests__/verification-requirements.test.ts',
  'scripts/__tests__/verification.test.ts',
  'scripts/__tests__/verify-affected.test.ts',
  'scripts/__tests__/verify-lanes.test.ts',
  'scripts/__tests__/verify-parallel.test.ts',
  'scripts/__tests__/vitest-results.test.ts',
  // Local development and test helpers.
  'scripts/__tests__/invalid-databases.test.ts',
  'scripts/__tests__/local-services.test.ts',
  'scripts/__tests__/restart-local-*.test.ts',
  'scripts/__tests__/scenario-evidence.test.ts',
]
export const FAST_SCRIPTS_EXCLUDE = [...FAST_EXCLUDE, ...SLOW_SCRIPTS_INCLUDE, ...TOOLING_INCLUDE]
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

/** Run by `pnpm test:tooling` and by Routine only; neither `test:fast` nor `test:slow` includes it. */
export const TOOLING_PROJECT_GLOBS: TestProjectGlob[] = [
  { name: 'tooling', include: TOOLING_INCLUDE, exclude: BASE_EXCLUDE },
]

export const TEST_PROJECT_GLOBS: TestProjectGlob[] = [...FAST_PROJECT_GLOBS, ...SLOW_PROJECT_GLOBS, ...TOOLING_PROJECT_GLOBS]
