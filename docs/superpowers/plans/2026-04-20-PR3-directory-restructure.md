# PR-3 目录重组与边界固化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理 PR-1 遗留的兼容 stub，将 `src/` 重命名为 `client/`，将 `server/` 内的自定义代码 / 房间 / 对局相关文件分别归拢到 `server/custom-code/` 与 `server/game/` 子目录，并通过 ESLint `no-restricted-imports` 与 `package.json.sideEffects` 把三层边界固化到工具链层面。

**Architecture:** 目录重组不涉及运行时逻辑改造，几乎全部 diff 都是 `git mv` + import 路径更新 + 工具链配置调整。风险在于（1）`server/game-session.ts` 被 242+ 个会话测试引用，导入路径要同步迁移；（2）`src/→client/` 触及 `tsconfig.app.json`、`index.html`、`deploy-pages.yml`、`restart-intranet.sh`；（3）ESLint 新规则可能暴露既有违反。逐步迁移、每一步绿测保证可逐 commit 回滚。

**Tech Stack:** TypeScript、pnpm scripts、Vitest、Vite、ESLint `no-restricted-imports`、GitHub Actions。

---

## 前置调研（已完成）

**现有 PR-1 遗留 stub（待删除）：**

- `server/farm-choice.ts`、`server/farm-interaction.ts`、`server/fence-validation.ts`、`server/plow-validation.ts`、`server/sow-validation.ts`、`server/validators.ts`、`server/occupation-hand-interaction.ts`：均为 `export * from '../shared/logic/farm/*'` re-export。
- `server/ast-validator.ts`：`export * from '../shared/custom-code/ast-validator'`。
- `shared/cards/custom-code-types.ts`：`export * from '../custom-code/types'`。

**外部消费者（需改 import 路径）：**

- `shared/actions/__tests__/fencing.test.ts:7` 引用 `server/fence-validation`。
- `server/game-router.ts:4-5` 内部使用 `./fence-validation`、`./farm-choice`。
- `server/workshop.ts`、`server/card-compiler.ts`、`server/custom-code-runtime.ts`、`server/game-router.ts` 共 4 处引用 `shared/cards/custom-code-types`。

**src/ 重命名需改：**

- `tsconfig.app.json` `include` / `exclude`。
- `index.html` `<script src="/src/main.tsx">`。
- `.github/workflows/deploy-pages.yml` path filter `src/**`。
- `restart-intranet.sh`、`deploy-backend.sh`、`docker-compose.prod.yml`、`Dockerfile`：经 grep 均未引用 `src/`（Dockerfile 仅复制 server + shared）。
- 源码均为相对 import，`git mv` 后无需批量替换。

**server/ 子目录重组目标：**

```
server/custom-code/
  ast-validator-guard.ts   # 若干服务端校验相关逻辑（或合并到 compiler.ts）
  client.ts                # 原 custom-code-executor/client.ts
  compiler.ts              # 原 server/card-compiler.ts
  engine.ts                # 原 custom-code-executor/engine.ts
  executor-worker.ts       # 原 custom-code-executor/executor-worker.ts
  isolate-runner.ts        # 原 custom-code-executor/isolate-runner.ts
  runtime.ts               # 原 server/custom-code-runtime.ts

server/game/
  authoritative-session.ts  # 原 server/game-session.ts（保留 GameSession 导出供 242+ 测试消费）
  room-manager.ts           # 原 server/room-manager.ts
```

**范围外（延后到 PR-4 或独立 PR）：**

- `shared/cards/card-effects.ts`、`shared/cards/card-listeners.ts`：这两个文件内部还有真实导出被广泛消费，仅仅有一小部分 legacy function 被标 `@deprecated`。PR-3 不整体删除，留到 PR-4 随懒加载一起处理。
- 主包 bundle 切分 / workshop lazy-load：PR-4 专项。
- 卡牌 draft 玩法：PR-5。

---

## File Structure

**新建：**

- `server/custom-code/` — 集中自定义代码执行链路（compiler + runtime + engine + isolate runner + worker）
- `server/game/` — 对局主链路（room manager + authoritative session wrapper）
- `client/` — 由 `src/` rename 而来

**删除：**

- `server/farm-choice.ts`、`server/farm-interaction.ts`、`server/fence-validation.ts`、`server/plow-validation.ts`、`server/sow-validation.ts`、`server/validators.ts`、`server/occupation-hand-interaction.ts`（7 个 re-export stub）
- `server/ast-validator.ts`
- `shared/cards/custom-code-types.ts`
- `server/card-compiler.ts`（移到 `server/custom-code/compiler.ts`）
- `server/custom-code-runtime.ts`（移到 `server/custom-code/runtime.ts`）
- `server/custom-code-executor/` 整目录（移到 `server/custom-code/`）
- `server/room-manager.ts`（移到 `server/game/room-manager.ts`）
- `server/game-session.ts`（移到 `server/game/authoritative-session.ts`）
- `src/`（rename 为 `client/`）

**修改：**

- `tsconfig.app.json`、`index.html`、`.github/workflows/deploy-pages.yml`（src→client）
- `package.json`（新增 `sideEffects`）
- `eslint.config.js`（新增 `no-restricted-imports` 规则，**仅新违反报 error**，存量违反允许 warn 过渡）
- `vite.config.ts`（如有 src 硬编码）
- 约 242 个 session 测试文件：`../game-session` → `../game/authoritative-session`（sed 可搞）

---

## Task 1 — 删除 server/ 内 farm 辅助 re-export stubs

**Files:**

- Delete: `server/farm-choice.ts`、`server/farm-interaction.ts`、`server/fence-validation.ts`、`server/plow-validation.ts`、`server/sow-validation.ts`、`server/validators.ts`、`server/occupation-hand-interaction.ts`
- Modify: `server/game-router.ts`（改 import）、`shared/actions/__tests__/fencing.test.ts`（改 import）

- [ ] **Step 1：列出所有外部消费者**

```bash
grep -rn "from ['\"].*server/farm-choice\|from ['\"].*server/farm-interaction\|from ['\"].*server/fence-validation\|from ['\"].*server/plow-validation\|from ['\"].*server/sow-validation\|from ['\"].*server/validators\|from ['\"].*server/occupation-hand-interaction" --include="*.ts" --include="*.tsx" .
```

Expected：仅 `server/game-router.ts`（内部）、`shared/actions/__tests__/fencing.test.ts`（测试）两类。

- [ ] **Step 2：更新 `server/game-router.ts` 的 import**

把

```ts
import { normalizePlayerFarm } from './fence-validation.ts'
import { applyFarmChoice } from './farm-choice.ts'
```

改为

```ts
import { normalizePlayerFarm } from '../shared/logic/farm/fence-validation.ts'
import { applyFarmChoice } from '../shared/logic/farm/farm-choice.ts'
```

- [ ] **Step 3：更新 `shared/actions/__tests__/fencing.test.ts:7`**

把

```ts
import { validateFenceSelection } from '../../../server/fence-validation'
```

改为

```ts
import { validateFenceSelection } from '../../logic/farm/fence-validation'
```

- [ ] **Step 4：删除 7 个 stub**

```bash
rm server/farm-choice.ts server/farm-interaction.ts server/fence-validation.ts \
   server/plow-validation.ts server/sow-validation.ts server/validators.ts \
   server/occupation-hand-interaction.ts
```

- [ ] **Step 5：跑测试**

```bash
pnpm test
```

Expected：2262 tests passed（与基线一致）。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "refactor(server): remove farm-helper re-export shims"
```

---

## Task 2 — 删除 server/ast-validator.ts re-export stub

**Files:**

- Delete: `server/ast-validator.ts`

- [ ] **Step 1：确认无消费者**

```bash
grep -rn "from ['\"].*server/ast-validator" --include="*.ts" --include="*.tsx" .
```

Expected：空输出。

- [ ] **Step 2：删除**

```bash
rm server/ast-validator.ts
```

- [ ] **Step 3：跑测试**

```bash
pnpm test
```

Expected：全绿。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "refactor(server): remove ast-validator re-export shim"
```

---

## Task 3 — 删除 shared/cards/custom-code-types.ts re-export stub

**Files:**

- Delete: `shared/cards/custom-code-types.ts`
- Modify: `server/workshop.ts`、`server/card-compiler.ts`、`server/custom-code-runtime.ts`、`server/game-router.ts`（4 处 import）

- [ ] **Step 1：列出消费者**

```bash
grep -rn "from ['\"].*shared/cards/custom-code-types" --include="*.ts" --include="*.tsx" .
```

Expected：4 个文件。

- [ ] **Step 2：批量替换**

对每个消费者文件，将

```ts
from '../shared/cards/custom-code-types'
```

替换为

```ts
from '../shared/custom-code/types'
```

（注意 import 路径相对深度一致；`server/*.ts` 相对深度不变，其余按实际调整。）

- [ ] **Step 3：删除 stub**

```bash
rm shared/cards/custom-code-types.ts
```

- [ ] **Step 4：跑测试 + lint**

```bash
pnpm test && pnpm run lint
```

Expected：全绿，lint 不出新 error。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "refactor(shared): drop custom-code-types re-export shim"
```

---

## Task 4 — 创建 server/custom-code/，搬迁 executor + compiler + runtime

**Files:**

- Create dir: `server/custom-code/`
- Move:
  - `server/custom-code-executor/client.ts` → `server/custom-code/client.ts`
  - `server/custom-code-executor/engine.ts` → `server/custom-code/engine.ts`
  - `server/custom-code-executor/executor-worker.ts` → `server/custom-code/executor-worker.ts`
  - `server/custom-code-executor/isolate-runner.ts` → `server/custom-code/isolate-runner.ts`
  - `server/card-compiler.ts` → `server/custom-code/compiler.ts`
  - `server/custom-code-runtime.ts` → `server/custom-code/runtime.ts`
- Modify：所有引用上述文件的 import 路径

- [ ] **Step 1：列出所有外部消费者**

```bash
grep -rn "from ['\"].*server/custom-code-executor\|from ['\"].*server/card-compiler\|from ['\"].*server/custom-code-runtime" --include="*.ts" --include="*.tsx" .
```

记录所有匹配文件与行号到临时列表。

- [ ] **Step 2：使用 `git mv` 搬迁**

```bash
mkdir -p server/custom-code
git mv server/custom-code-executor/client.ts server/custom-code/client.ts
git mv server/custom-code-executor/engine.ts server/custom-code/engine.ts
git mv server/custom-code-executor/executor-worker.ts server/custom-code/executor-worker.ts
git mv server/custom-code-executor/isolate-runner.ts server/custom-code/isolate-runner.ts
rmdir server/custom-code-executor
git mv server/card-compiler.ts server/custom-code/compiler.ts
git mv server/custom-code-runtime.ts server/custom-code/runtime.ts
```

- [ ] **Step 3：修复被搬迁文件内部的相对 import**

对每个被搬迁文件，检查其 import 是否指向 `../shared/...` 或 `./xxx`，逐一调整深度：

- `server/custom-code-executor/*` 原相对 `../shared/...`（2 级），搬到 `server/custom-code/*` 仍为 2 级，无需改
- `server/card-compiler.ts` 原相对 `../shared/...`（1 级）+ `./xxx`（同级），搬到 `server/custom-code/compiler.ts` 后 `../shared/...` → `../../shared/...`，同级 import 需改为指向 `server/` 原位置
- `server/custom-code-runtime.ts` 同理

逐文件用 `grep -n "^import" server/custom-code/*.ts` 审视，并用 Edit 修正。

- [ ] **Step 4：更新外部消费者 import**

对 Step 1 记录的每一处匹配，把 import 路径改为新位置：

- `from '../server/custom-code-executor/engine'` → `from '../server/custom-code/engine'`
- `from './card-compiler'` → `from './custom-code/compiler'`
- `from './custom-code-runtime'` → `from './custom-code/runtime'`
- 跨 shared/ 的引用按相对深度推算。

- [ ] **Step 5：类型检查 + 测试**

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit && pnpm test
```

Expected：tsc 0 error，测试全绿。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "refactor(server): consolidate custom-code under server/custom-code/"
```

---

## Task 5 — 搬迁 server/room-manager.ts → server/game/room-manager.ts

**Files:**

- Create dir: `server/game/`
- Move: `server/room-manager.ts` → `server/game/room-manager.ts`
- Modify：所有引用 `server/room-manager` 的文件

- [ ] **Step 1：列出消费者**

```bash
grep -rn "from ['\"].*server/room-manager\|from ['\"]\\./room-manager" --include="*.ts" --include="*.tsx" .
```

- [ ] **Step 2：搬迁**

```bash
mkdir -p server/game
git mv server/room-manager.ts server/game/room-manager.ts
```

- [ ] **Step 3：修正 room-manager.ts 内部相对 import**

所有 `../shared/...` → `../../shared/...`；所有原 `./xxx`（同级 server 文件）→ `../xxx`。

- [ ] **Step 4：更新外部消费者**

按记录的 import 路径逐一调整。

- [ ] **Step 5：测试 + 类型检查**

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit && pnpm test
```

Expected：全绿。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "refactor(server): move room-manager to server/game/"
```

---

## Task 6 — 搬迁 server/game-session.ts → server/game/authoritative-session.ts

**Files:**

- Move: `server/game-session.ts` → `server/game/authoritative-session.ts`
- Modify：~242 个 `server/__tests__/*.ts` 测试文件（`../game-session` → `../game/authoritative-session`）
- Modify：`server/game-router.ts`、`server/game/room-manager.ts`、`server/index.ts` 等内部消费者

**决策：** 保留文件内的 `export class GameSession extends GameCore` 不变（现在它已经是 GameCore 的薄子类，不再是 re-export 层）。spec 用 "authoritative-session.ts" 作为新名，意图是让名字反映它"权威对局包装"的职责。实际上我们不新增第二个文件——直接改名 `game-session.ts` → `game/authoritative-session.ts`，class 名仍为 `GameSession` 供测试消费。

- [ ] **Step 1：列出所有消费者**

```bash
grep -rln "from ['\"].*server/game-session\|from ['\"]\\./game-session\|from ['\"]\\.\\./game-session" --include="*.ts" --include="*.tsx" .
```

预期 ~242+ 测试文件 + 少量 server 内部（game-router、room-manager、index）。

- [ ] **Step 2：搬迁**

```bash
git mv server/game-session.ts server/game/authoritative-session.ts
```

- [ ] **Step 3：修正 authoritative-session.ts 内部相对 import**

所有 `../shared/...` → `../../shared/...`，同级 `./custom-code-runtime` 已由 Task 4 改为 `./custom-code/runtime`，搬迁后变 `../custom-code/runtime`。

- [ ] **Step 4：批量更新测试 import**

```bash
# server/__tests__/ 下所有 .ts/.tsx
find server/__tests__ -name '*.ts' -exec sed -i \
  "s|from '../game-session'|from '../game/authoritative-session'|g; \
   s|from \"../game-session\"|from \"../game/authoritative-session\"|g" {} +
```

- [ ] **Step 5：更新 server 内部消费者**

手工（或同等 sed）改 `server/game-router.ts`、`server/game/room-manager.ts`、`server/index.ts` 等非测试文件对 game-session 的 import。

- [ ] **Step 6：类型检查 + 测试**

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit && pnpm test
```

Expected：全绿。若某个测试漏替换会立即报 module not found。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "refactor(server): move GameSession to server/game/authoritative-session"
```

---

## Task 7 — 重命名 src/ → client/

**Files:**

- Rename: `src/` → `client/`
- Modify: `tsconfig.app.json`、`index.html`、`.github/workflows/deploy-pages.yml`

- [ ] **Step 1：确认 `src/` 内无绝对 import**

```bash
grep -rn "from ['\"]src/\|from ['\"]/src" src 2>/dev/null | head
```

Expected：空（CLAUDE.md 声明全项目相对 import）。

- [ ] **Step 2：搬迁目录**

```bash
git mv src client
```

- [ ] **Step 3：更新 `tsconfig.app.json`**

```json
{
  "include": ["client", "shared"],
  "exclude": [
    "client/**/__tests__/**",
    "client/services/__tests__/**",
    "shared/**/__tests__/**",
    ...
  ]
}
```

- [ ] **Step 4：更新 `index.html`**

```html
<script type="module" src="/client/main.tsx"></script>
```

- [ ] **Step 5：更新 `.github/workflows/deploy-pages.yml`**

path filter：

```yaml
paths:
  - 'client/**'
  - 'shared/**'
  - 'public/**'
  - 'index.html'
  - 'vite.config.ts'
  - 'package.json'
  - '.github/workflows/deploy-pages.yml'
```

- [ ] **Step 6：lint + build + test**

```bash
pnpm run lint && pnpm run build && pnpm test
```

Expected：全绿；Vite build 能产出 `dist/`。

- [ ] **Step 7：本地启动冒烟**

```bash
./restart-intranet.sh
# curl 前端首页 + 后端 /api/health
curl -sI http://localhost:5173/ | head -1     # 期 200
curl -s  http://localhost:5175/api/health     # 期 {"ok":true,...}
```

Expected：均返回 200 / ok。停掉服务 `pkill -f 'node_modules/.bin/tsx\|node_modules/.bin/vite'`。

- [ ] **Step 8：Commit**

```bash
git add -A
git commit -m "refactor: rename src/ to client/"
```

---

## Task 8 — 声明 package.json 的 sideEffects

**Files:**

- Modify: `package.json`

**目标：** 标注哪些文件有副作用（Vite / Rollup 打包时按此做 tree-shaking）。三个仅初始化用途的模块必须列为"有副作用"；其余纯模块均可 tree-shake。

- [ ] **Step 1：在 `package.json` 顶层加入：**

```json
{
  ...
  "sideEffects": [
    "**/*.css",
    "client/main.tsx",
    "shared/cards/register-all.ts",
    "shared/cards/catalog.ts"
  ]
}
```

- [ ] **Step 2：重新 build 并比较主包大小**

```bash
pnpm run build
# 打印 dist/assets/*.js 大小
ls -la dist/assets/*.js | head -5
```

记录 main bundle 尺寸（用于 PR-4 基线对照）。

- [ ] **Step 3：测试 + 本地冒烟**

```bash
pnpm test
```

Expected：2262 tests 通过。

- [ ] **Step 4：Commit**

```bash
git add package.json
git commit -m "build: declare sideEffects for tree-shaking"
```

---

## Task 9 — 启用 ESLint no-restricted-imports 层间边界规则

**Files:**

- Modify: `eslint.config.js`

**目标：**

| 所在层 | 禁止 import |
|---|---|
| `shared/**` | 不能 import `../client/*` 或 `../server/*` |
| `server/**` | 不能 import `../client/*` |
| `client/**` | 不能 import `../server/*` |

采用 `no-restricted-imports` + patterns；违反新增规则作为 **warn**（避免存量阻塞 CI），然后把必要的降级项改为 error（视实际扫描结果）。

- [ ] **Step 1：加入 `eslint.config.js`**

在已有配置块追加：

```js
{
  files: ['shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['warn', {
      patterns: [
        { group: ['**/client/**', '../client/**', '../../client/**'], message: 'shared/ must not import from client/' },
        { group: ['**/server/**', '../server/**', '../../server/**'], message: 'shared/ must not import from server/' },
      ],
    }],
  },
},
{
  files: ['server/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['warn', {
      patterns: [
        { group: ['**/client/**', '../client/**', '../../client/**'], message: 'server/ must not import from client/' },
      ],
    }],
  },
},
{
  files: ['client/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['warn', {
      patterns: [
        { group: ['**/server/**', '../server/**', '../../server/**'], message: 'client/ must not import from server/' },
      ],
    }],
  },
},
```

- [ ] **Step 2：跑 lint，观察新违反**

```bash
pnpm run lint 2>&1 | grep "no-restricted-imports" | head -20
```

若出现违反：

- 若是 `shared/actions/__tests__/fencing.test.ts` 这类测试 import `server/*`：测试本就在 shared/ 但引用 server 实现，是已知的边界模糊。加入 eslint `files` 排除 `shared/**/__tests__/**`。
- 若属于合理依赖：调整源码把对应辅助函数搬到 shared；若仓促不修，可在该文件顶部加 `// eslint-disable-next-line no-restricted-imports` 并在文档登记 follow-up。

预期：经 Task 1-7 搬迁后，主要违反已修复，仅剩个位数合理 TODO。

- [ ] **Step 3：跑完整 lint 确认 exit 0**

```bash
pnpm run lint; echo "exit=$?"
```

Expected：exit 0（warn 不阻塞）。

- [ ] **Step 4：Commit**

```bash
git add eslint.config.js
git commit -m "lint: enforce three-layer import boundaries (warn)"
```

---

## Task 10 — 处理 spec §10 的前端 "规则味儿 import"

**Files:**

- Inspect: `client/components/board/FarmBoard.tsx`、`client/app/hooks/use-round-flow.ts`
- 视情况：创建 `shared/cards/view-helpers/` 搬入 `collectLockedFarmTileKeys`

**目标：** spec §10 要求 PR-3 / PR-4 间逐一审查前端的规则味儿 import。本 task 只处理能原地搞定的；其他的登记 TODO 到 `docs/card_progress.md §7` follow-up。

- [ ] **Step 1：审查 `collectLockedFarmTileKeys`**

读 `shared/cards/card-effects.ts` 中 `collectLockedFarmTileKeys` 的实现。若为 pure 显示计算（输入 `PlayerState`，输出 `Set<string>`，无副作用、无规则裁定），搬到 `shared/cards/view-helpers/locked-tiles.ts`，更新 `FarmBoard.tsx` import。否则登记 TODO。

- [ ] **Step 2：审查 `readCardResourceStats`、`getWorkerHeldOnCard`**

同上策略。若 pure：搬到 view-helpers；否则 TODO。

- [ ] **Step 3：审查 `applyMajorEffectsToAllPlayers`**

此函数用于 `use-round-flow.ts`。spec §10 建议"改为服务端下发预计算结果，前端从 state 读"——这是独立重构，不在 PR-3 scope。登记 TODO 到 `docs/card_progress.md §7 基础设施清单`。

- [ ] **Step 4：测试 + lint**

```bash
pnpm test && pnpm run lint
```

Expected：全绿。

- [ ] **Step 5：Commit（若有改动）**

```bash
git add -A
git commit -m "refactor(client): move pure view helpers out of card-effects"
```

若本 task 只登记 TODO，无代码改动，则跳过 commit，把 TODO 记录放到 Task 11 的最终文档同步 commit 里。

---

## Task 11 — 最终验证 + 文档同步

**Files:**

- Modify: `docs/ENGINE_ARCHITECTURE.md`（目录结构节）、`docs/card_progress.md §7`（基础设施清单登记 follow-up TODO）

- [ ] **Step 1：完整本地验证**

```bash
pnpm install
pnpm run lint                  # exit 0
pnpm test                      # 2262 tests pass
pnpm run build                 # 成功，dist/ 产出
pnpm run check:reaches -- --strict    # 绿
pnpm run check:no-dsl -- --strict     # 绿
pnpm run check:prompt-sync -- --strict # 绿
```

- [ ] **Step 2：本地启动冒烟**

```bash
./restart-intranet.sh
sleep 3
curl -sI http://localhost:5173/ | head -1
curl -s  http://localhost:5175/api/health
pkill -f 'node_modules/.bin/tsx\|node_modules/.bin/vite' || true
```

Expected：前端 200、后端 `{"ok":true,...}`。

- [ ] **Step 3：更新 `docs/ENGINE_ARCHITECTURE.md` 的目录树部分**

把 `src/` 改为 `client/`；`server/custom-code/`、`server/game/` 子目录写入结构图。

- [ ] **Step 4：更新 `docs/card_progress.md §7 基础设施清单`**

追加两行：

- PR-3 目录重组完成：`src→client`、`server/custom-code/`、`server/game/`、三层边界 ESLint warn
- TODO：`applyMajorEffectsToAllPlayers` 服务端预计算迁移（follow-up PR）
- TODO：`FarmBoard` 其余 card-effects 导入审查（follow-up PR）

- [ ] **Step 5：跑完整 check 一遍**

```bash
pnpm test && pnpm run build && pnpm run check:prompt-sync -- --strict
```

- [ ] **Step 6：最终 commit**

```bash
git add -A
git commit -m "docs: sync structure for PR-3 directory restructure"
```

---

## Self-Review 结果

- **Spec coverage**：逐条 check §9 PR-3 小节 6 项要求
  - src→client ✅（Task 7）
  - server/custom-code-executor→server/custom-code ✅（Task 4）
  - server/card-compiler.ts→server/custom-code/compiler.ts ✅（Task 4）
  - server/custom-code-runtime.ts→server/custom-code/runtime.ts ✅（Task 4）
  - server/room-manager.ts→server/game/room-manager.ts ✅（Task 5）
  - 删除 game-session.ts 兼容层 + 新增 authoritative-session.ts ✅（Task 6，含决策说明）
  - 批量更新 import ✅（贯穿 Task 1-7）
  - 更新 tsconfig / vite / index.html / deploy-pages.yml 等 ✅（Task 7）
  - ESLint no-restricted-imports ✅（Task 9）
  - package.json.sideEffects ✅（Task 8）
  - §10 前端规则味儿 import 审查 ✅（Task 10）
- **Placeholder scan**：所有命令均为实命令；所有 sed/grep 均给了具体 pattern。
- **Type consistency**：`GameSession` 类名保留；`CustomCodeManifest` 等类型 import 路径一一对齐。

## Pending Tasks (Deferred)

- PR-4 懒加载：shared/cards/card-effects.ts、card-listeners.ts 的 legacy @deprecated 函数逐步删；主包目标 < 200KB
- 服务端下发预计算结果替代 `applyMajorEffectsToAllPlayers`
- A92 / B38 flaky 根因修复（当前 `{ retry: 2 }` 屏蔽）
