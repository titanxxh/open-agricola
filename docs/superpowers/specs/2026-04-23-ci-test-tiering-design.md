# CI 测试分层（fast / slow）设计

> 状态：approved（2026-04-23 brainstorming）
> 实施载体：`.worktree/ci-test-tiering` 分支 `design/ci-test-tiering`

## 1. 背景与目标

当前 CI（`.github/workflows/ci.yml` 的 `verify` job）每次 push / PR 都跑全量
`pnpm test`——464 个测试文件，2525 个测试用例。Vitest 的 wall-time 约 10 分钟（`tests` 自身只 ~30s，其余是 transform / setup / import 摊销在 459+ 文件上的固定开销）。

目标：

- **快速反馈**：PR / 普通 push 跑完应在 2-3 分钟左右
- **更省 CI 分钟**：不重复跑大量"今天没改的卡"
- **不丢覆盖度**：被排除的测试在独立的 `CI Full` workflow 里照常跑

## 2. 架构

```
                    ┌─────────────────────────────────────────────┐
                    │  vitest run --project fast | --project slow │
                    └─────────────┬───────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  pnpm test:fast            pnpm test:slow             pnpm test (全量)
  排除 [A-E]\d+_*-session   只跑 [A-E]\d+_*-session    本地 / ci-full 用
        ▼                         ▼
  ─────────────────────     ─────────────────────────
  ci.yml (现有，改 1 行)    ci-full.yml (新)
   on: push/pr/dispatch      on: schedule (每日 02:00 北京)
                                  + workflow_dispatch
```

要点：

- 用 vitest 4 的 `projects` 配置（多项目模式）划分 fast / slow，共享同一份
  `setupFiles`，只是 `include` 集合不同
- 不动测试代码，纯靠路径 glob 划分
- `pnpm test`（不带 `--project`）跑所有 projects = 全量，作为本地 + ci-full 的入口
- `pnpm test:fast` / `pnpm test:slow` 给两条 CI 用
- `ci-full.yml` 跑**全量**（fast + slow + 全部 check 脚本），定位为兜底，
  保证 fast 集合无意中漏掉的测试不会成为永久盲点

## 3. vitest 配置

`vitest.config.ts` 改成多项目模式：

```ts
import { defineConfig } from 'vitest/config'

const FAST_INCLUDE = [
  'shared/**/*.test.ts',
  'shared/**/*.test.tsx',
  'client/**/*.test.ts',
  'client/**/*.test.tsx',
  'tests/**/*.test.ts',
  'scripts/**/__tests__/*.test.ts',
  'server/__tests__/*.test.ts',
  'server/workshop-pr/__tests__/*.test.ts',
]
const SLOW_INCLUDE = ['server/__tests__/[A-E][0-9]*_*-session.test.ts']
const FAST_EXCLUDE = [
  'e2e-tests/**',
  'scripts/test-actions.spec.ts',
  ...SLOW_INCLUDE,
]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'fast',
          include: FAST_INCLUDE,
          exclude: FAST_EXCLUDE,
          setupFiles: ['./client/__tests__/setup.ts'],
        },
      },
      {
        test: {
          name: 'slow',
          include: SLOW_INCLUDE,
          setupFiles: ['./client/__tests__/setup.ts'],
        },
      },
    ],
  },
})
```

`package.json` scripts：

```json
"test": "vitest run --exclude e2e-tests --exclude scripts/test-actions.spec.ts",
"test:fast": "vitest run --project fast",
"test:slow": "vitest run --project slow"
```

`pnpm test` 保持现有签名以避免破坏外部脚本和 muscle memory。

**风险**：vitest 4.1.4 的 `projects` 是新 API（替代旧 `workspace`），实施第 1 步
要先写两个 dummy project 各跑 1 个文件，确认配置生效再批量切换。

## 4. CI workflow 改动

### 4.1 `ci.yml`（既有，改两处）

```yaml
verify:
  runs-on: ubuntu-latest
  timeout-minutes: 10        # ← 原 20，给 fast 层留充分余量
  steps:
    # ...其它步骤不动...
    - name: Unit tests (fast tier)
      run: pnpm run test:fast # ← 原 `pnpm test`
```

其它 step（lint / build / check-reaches / check-no-dsl / check-bundle-size /
check-catalog-types / check-community-deck）**不动**。它们都很快，且都是关键 gate。

### 4.2 `ci-full.yml`（新文件）

```yaml
name: CI Full
on:
  schedule:
    - cron: '0 18 * * *'      # 每日 02:00 北京时间（UTC+8）
  workflow_dispatch:
jobs:
  full:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.0 }
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm run lint
      - name: All tests (fast + slow)
        run: pnpm test            # 不带 --project = 全量
      - name: Build
        run: pnpm run build
      - name: Check reaches (strict)
        run: pnpm run check:reaches -- --strict
      - name: Check no-DSL (strict)
        run: pnpm run check:no-dsl -- --strict
      - name: Check bundle size
        run: pnpm run check:bundle-size
      - name: Check catalog types
        run: pnpm run check:catalog-types
      - name: Check community deck
        run: pnpm run check:community-deck
```

**故意不复用** `ci.yml` 的 lint/build/check 步骤——cron job 跑全部 check 是为了发现
"今天 push 时没动这条但其实可能有 regression"，不是为了去重 step。

**失败处理**：GitHub 默认会发邮件给最近 commit author（即维护者），不另加
Slack/Issue 自动化（YAGNI）。

## 5. 划分边界

### 5.1 slow 层规则（唯一）

```
server/__tests__/[A-E][0-9]*_*-session.test.ts
```

- `[A-E]` = 牌组前缀（A=major、B-E=各 Tier）
- `[0-9]*_` = 牌号 + 下划线
- `-session.test.ts` = session 测试后缀

实测匹配 **254** 文件。

### 5.2 仍在 fast 层（典型例子）

- `server/__tests__/game-session-contract.test.ts`（不含牌号前缀）
- `server/__tests__/community-deck-session.test.ts`
- `server/__tests__/meeting-place-session.test.ts`
- `server/__tests__/payload-validation.test.ts`
- `server/__tests__/sow-validation.test.ts`
- `server/__tests__/dev-create-pasture.test.ts`
- `server/__tests__/card-held-return-home.test.ts`
- `server/__tests__/game-session-custom-context.test.ts`
- `server/workshop-pr/__tests__/*.test.ts`
- `shared/cards/__tests__/A47_Trellises.test.ts`（不在 server/__tests__，是纯单测）
- `client/components/**/__tests__/*.test.tsx`
- `tests/*.test.ts`、`scripts/__tests__/*.test.ts`

### 5.3 一致性兜底

新 session 测试只要按命名规范 `{Deck}_{Number}_{Name}-session.test.ts` 写，自动落入
slow 层；无需改 `vitest.config.ts`。

ci-full 跑全量等于反向校验 fast 集合完整性。如果有人手滑命名（例：
`cardA10_session.test.ts`）导致两层都漏，ci-full 的 `pnpm test` 仍会跑。

## 6. 性能预期

| 指标 | 现状 (`pnpm test`) | 改后 fast (`pnpm test:fast`) |
|---|---|---|
| 测试文件数 | 464 | 210 |
| 比例 | 100% | 45% |
| 现 CI 总耗时（粗估） | ~10 min | ~3-4 min |
| Vitest setup 耗时 | ~510s | ~230s |

实际数字会在实施时通过 1-2 次 PR run 得真值，写进 PR 描述。

## 7. 文档更新

- `CLAUDE.md` 「命令」段加一行说明 `test:fast` / `test:slow`：

  ```
  pnpm test           # 全量（本地默认 / ci-full）
  pnpm test:fast      # 只跑 fast 层（默认 CI 用）
  pnpm test:slow      # 只跑 slow 层（254 个单卡 session 测试）
  ```

- 不写新独立文档（YAGNI）

## 8. 实施顺序

1. 在 `vitest.config.ts` 写 dummy projects 验证 vitest 4 `projects` API
2. 切到完整的 `FAST_INCLUDE` / `SLOW_INCLUDE` glob，本地跑通
   `pnpm test:fast` 和 `pnpm test:slow`
3. 验证 `pnpm test`（不带 --project）= fast + slow 总数 == 之前全量数
4. 改 `package.json` scripts
5. 改 `.github/workflows/ci.yml`：`pnpm test` → `pnpm test:fast`，timeout 20 → 10
6. 新建 `.github/workflows/ci-full.yml`
7. 改 `CLAUDE.md` 命令说明段
8. push 一个空-改动 commit 验证 ci.yml 的 fast 跑通；手动 dispatch ci-full 验证
9. 把 PR 描述里附实际 wall-time
