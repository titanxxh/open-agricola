import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRepositoryPlan, type VerificationPlan } from '../ci/verification-plan'
import { FULL_TASK_IDS } from '../ci/verification-tasks'

const root = resolve(import.meta.dirname, '../..')

const replays = [
  {
    pull: 1556,
    fullCatalog: false,
    files: [
      'client/app/MyActiveGames.tsx',
      'client/app/__tests__/LobbyPage.test.tsx',
      'client/app/parents/ParentSelectionOverlay.tsx',
      'client/app/parents/__tests__/ParentSelectionOverlay.test.ts',
      'server/__tests__/lobby-my-rooms.test.ts',
      'server/lobby-my-rooms.ts',
    ],
  },
  {
    pull: 1557,
    fullCatalog: false,
    files: [
      '.gitignore',
      'CONTEXT.md',
      'client/app/GameContainerApi.tsx',
      'client/app/encyclopedia/EncyclopediaBrowser.tsx',
      'client/app/encyclopedia/EncyclopediaDetail.tsx',
      'client/app/encyclopedia/EncyclopediaTextFace.tsx',
      'client/components/board/ActionBoard.tsx',
      'client/components/board/ActionSpaceFace.css',
      'client/components/board/ActionSpaceFace.tsx',
      'client/components/board/SpecialActionCardFace.tsx',
      'client/components/common/ActionTextReference.css',
      'client/components/common/ActionTextReference.tsx',
      'client/components/common/CardDescriptionText.tsx',
      'client/components/common/CardWithCopy.tsx',
      'client/components/common/PlayerCard.tsx',
      'client/components/common/ResourceText.tsx',
      'client/components/common/StaticActionPreview.tsx',
      'client/components/common/__tests__/ActionTextReference.test.tsx',
      'client/components/common/__tests__/CardWithCopy.test.tsx',
      'client/contexts/ActionReferenceContext.ts',
      'client/services/action-references.ts',
      'docs/adr/0038-printed-action-references-use-explicit-targets.md',
      'docs/architecture/client.md',
      'docs/architecture/client_zh.md',
      'docs/architecture/shared-other.md',
      'docs/architecture/shared-other_zh.md',
      'e2e-tests/card-action-references.spec.ts',
      'i18n.ref',
      'replay-viewer/src/ReplayBoard.tsx',
      'scripts/__tests__/build-action-references.test.ts',
      'scripts/__tests__/card-description-double-underscore.test.ts',
      'scripts/__tests__/card-name-references.test.ts',
      'scripts/build-action-references.ts',
      'scripts/build-card-encyclopedia.ts',
      'shared/contract/__tests__/action-reference.test.ts',
      'shared/contract/action-reference.ts',
      'shared/i18n/__tests__/zh.test.ts',
      'shared/projections/card-text-icons.ts',
    ],
  },
  {
    pull: 1558,
    fullCatalog: false,
    files: [
      'client/app/GameContainerApi.tsx',
      'client/app/__tests__/WaitingRoomPresentation.test.tsx',
      'e2e-tests/ws-dual-player.spec.ts',
    ],
  },
  {
    pull: 1561,
    fullCatalog: false,
    files: [
      'README.md',
      'README_zh.md',
      'restart-local.sh',
      'scripts/__tests__/restart-local-preview.test.ts',
    ],
  },
  {
    pull: 1562,
    fullCatalog: false,
    files: [
      'CONTEXT.md',
      'docs/architecture/engine.md',
      'docs/architecture/engine_zh.md',
      'docs/architecture/hooks.md',
      'docs/architecture/hooks_zh.md',
      'docs/architecture/server.md',
      'docs/architecture/server_zh.md',
      'server/__tests__/stage-hook-player-switch-boundary.test.ts',
      'server/connection/__tests__/ws-server.test.ts',
      'server/connection/room-router.ts',
      'shared/engine/engine-stack.ts',
      'shared/session/phases/round.ts',
      'shared/session/session-core.ts',
      'shared/session/stage-dispatch.ts',
    ],
  },
  {
    pull: 1563,
    fullCatalog: true,
    files: [
      'client/app/__tests__/LoginPage.test.tsx',
      'client/app/__tests__/OnboardingPage.test.tsx',
      'client/components/common/SiteCommunityLinks.tsx',
      'client/components/common/WhatsNew.css',
      'client/components/common/WhatsNew.tsx',
      'client/services/__tests__/whats-new.test.ts',
      'client/services/whats-new.ts',
      'client/styles/pages/game.css',
      'deploy-operations.sh',
      'docs/HOW_TO_DEPLOY.md',
      'docs/HOW_TO_DEPLOY_zh.md',
      'docs/architecture/client.md',
      'docs/architecture/client_zh.md',
      'docs/architecture/server.md',
      'docs/architecture/server_zh.md',
      'e2e-tests/whats-new.spec.ts',
      'i18n.ref',
      'scripts/__tests__/whats-new.test.ts',
      'scripts/update-whats-new.ts',
      'server/index.ts',
      'server/whats-new.ts',
      'shared/contract/__tests__/whats-new.test.ts',
      'shared/contract/whats-new.ts',
      'tsconfig.storage-tools.json',
    ],
  },
] as const

const unregisteredFrontend = [
  'client/contexts/ActionReferenceContext.ts',
  'client/services/action-references.ts',
  'client/components/common/WhatsNew.tsx',
  'client/services/whats-new.ts',
] as const

const singleCardFaces = [
  'client/components/common/CardWithCopy.tsx',
  'client/components/board/SpecialActionCardFace.tsx',
] as const

function planFor(paths: readonly string[]): VerificationPlan {
  return createRepositoryPlan({
    cwd: root,
    base: 'HEAD',
    fullTaskIds: FULL_TASK_IDS,
    changes: paths.map(path => ({ status: 'M', path })),
  })
}

function vitestFiles(plan: VerificationPlan): string[] {
  return plan.checks.flatMap(check => check.kind === 'vitest' ? check.files : [])
}

function browserFiles(plan: VerificationPlan): string[] {
  return plan.checks.flatMap(check => check.kind === 'browser' ? check.files : [])
}

function catalogTasks(plan: VerificationPlan): string[] {
  return plan.checks.flatMap(check => check.kind === 'catalog' ? [check.taskId] : [])
}

const isBrowserSpec = (path: string) => /^e2e-tests\/.+\.spec\.[cm]?[jt]sx?$/.test(path)
const isVitestFile = (path: string) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) && !isBrowserSpec(path)

describe('CI routine plan replays the pulls that outgrew path ownership', () => {
  it.each(replays)('pull $pull keeps changed tests, catalog tasks, warnings, and the full-catalog boundary', replay => {
    const plan = planFor(replay.files)
    const warnings = [...plan.wideningReasons, ...plan.expansionReasons]
    expect(warnings.join('\n')).not.toContain('Planner exception')
    if (replay.fullCatalog) {
      expect(plan.mode).toBe('full')
      expect(catalogTasks(plan)).toEqual([...FULL_TASK_IDS])
      return
    }
    expect(plan.mode).toBe('scoped')
    expect(catalogTasks(plan)).toEqual(['quality', 'build'])
    for (const file of replay.files.filter(isVitestFile)) expect(vitestFiles(plan)).toContain(file)
    for (const file of replay.files.filter(isBrowserSpec)) expect(browserFiles(plan)).toContain(file)
  }, 300_000)

  it('keeps one unregistered frontend file or one card-face file off the complete catalog', () => {
    for (const path of [...unregisteredFrontend, ...singleCardFaces]) {
      const plan = planFor([path])
      expect(plan.mode, path).toBe('scoped')
      expect(catalogTasks(plan), path).toEqual(['quality', 'build'])
      expect([...plan.wideningReasons, ...plan.expansionReasons].join('\n'), path).not.toContain('Planner exception')
    }
  }, 300_000)
})
