# Agent Playtest Spec

## 目标

第一版验证 4 人 Farmers of the Moor 局。4 个 player agent 各固定扮演一个玩家，主 agent 负责协调、执行、记录、复现材料归档。

核心目标：

- 让 4 个 agent 通过真实 UI 实际玩完一局 Farmers of the Moor，并尽量使用扩展新增规则推进游戏。
- 每个 player agent 在开局先读取 Farmers 规则摘要、基础规则摘要和自己的手牌，制定 Moor-first 路线，再按路线动态调整。
- 优先覆盖特殊行动、森林/沼泽、燃料供暖、病床 / Infirmary、马、Moor 主要改良 / 小改良；基础行动只作为支撑。
- 尽可能覆盖 4 人 Farmers 版图上的特殊行动、扩展行动格、回合行动格和常见 pending 流程。
- 持续发现规则、UI、同步、log 显示问题。
- 只要游戏还能继续，就记录问题后继续玩，覆盖中后期和终局。
- 每个问题必须带完整触发路径，后续可以按 snapshot + trace 复现。

## 非目标

- 第一版不跑 2/3/5/6 人局。
- 第一版只跑 Farmers of the Moor 4 人 preview 局，不跑 base-only / Seasons / Parents。
- 第一版不覆盖旧 `LogPanel`，只看当前 `ActionLog`。
- 第一版不做卡牌专项穷举。
- 第一版不追求最强 AI，只要求行动有规划、覆盖面足够广、不会故意走非法路径。
- 第一版不要求发现 bug 后自动修复。
- 第一版不把输出文件 commit。

## 实现里程碑

按最小可验证切片推进，不要一次性做完整 4-agent 系统：

- **M0（当前脚本）**：不接 LLM，用启发式策略把 Moor harness 跑通——特殊行动、供暖、喂养、trace、summary、snapshot，并能单局玩到终局。
- **M1**：接入 player agent 决策，验证开局规划与每步 intent 能解释路线 / 覆盖，并输出 plans / coverage。
- **M2**：批量多局 + bug 去重 + 截图 + 稳定 replay 命令。

## 角色

### 主 agent

主 agent 是唯一执行者：

- 创建 4 人游戏。
- 打开 4 个 Playwright browser context/page，分别作为 `p1`、`p2`、`p3`、`p4`。
- 开局读取 `output/rules/agricola-re-farmers-rules-summary.md` 和 `output/rules/agricola-re-rules-summary.md`，把 Farmers 优先的规则摘要注入给每个 player agent。
- 开局采集每个玩家自己的手牌、卡牌文字、初始农场、资源、可见 major improvement、已揭示行动格。
- 让每个 player agent 先输出本局 `openingPlan`。
- 在轮到某玩家时，把该玩家当前可见信息交给对应 player agent。
- 维护行动覆盖 ledger，告诉当前 player agent 哪些行动格本局还没覆盖或覆盖太少。
- 执行 player agent 返回的操作。
- 每步后采集 state、UI、log、截图和 trace。
- 判断问题是否 blocking。
- 写入 bug JSONL、trace 和关键 state 快照。

### Player agent

每个 player agent 只扮演一个玩家：

- 只基于自己的 UI 可见信息、可用按钮、当前提示、自己的手牌和主 agent 给出的公共覆盖信息做选择。
- 不直接访问其他玩家私有信息。
- 开局必须先阅读 Farmers 规则摘要、基础规则摘要和自己手牌的完整文字，再返回路线规划：特殊行动、燃料/供暖、森林/沼泽清理、马、Moor 改良、家庭增长、喂养、主要得分来源。
- 每个回合必须按 Moor-first 路线和当前局面选择行动，不能无理由每轮重复同一两个基础行动。
- 返回一个可执行意图，例如“执行 Cut Peat 清沼泽拿燃料”“执行 Fell Trees 清森林拿木材”“Horse Market 拿马”“用 Infirmary 处理病床人物”“确认当前 pending”。
- 可以报告它观察到的问题，例如按钮看不懂、log 重复、资源显示异常。

### Player Agent Prompt 模板

主 agent 给每个 player agent 的初始 prompt 使用以下模板，替换 `{player}` / `{contextPath}`：

```text
你是 Open Agricola Farmers of the Moor playtest 的 {player}。只根据 {player} 自己可见的信息决策，不读取其他玩家私有手牌。

先阅读：
- output/rules/agricola-re-farmers-rules-summary.md
- output/rules/agricola-re-rules-summary.md
- {contextPath}

本局目标不是最高分，而是尽可能用 Farmers of the Moor 新规则真实推进游戏并找 bug。优先级：
1. 当前 pending 必须先处理，记录 pending 类型和选择原因。
2. 优先执行特殊行动：Cut Peat、Fell Trees、Slash and Burn、Horse Market、Hiring Fair、Black Market、Illicit Work。
3. 主动测试森林/沼泽限制、燃料供暖、木材换燃料、病床、Infirmary、马的饲养/繁殖/兑换/计分。
4. 优先购买或尝试 Moor 主要改良 / 小改良；base 改良只作为喂养和继续游戏的支撑。
5. 基础行动只能作为 Moor 目标的支撑，例如拿资源买 Moor 改良、补食物、建房家庭增长。
6. 不要机械重复同一两个基础资源格；连续重复必须说明 Moor 目标或喂养压力。

每次返回 JSON：
{
  "player": "{player}",
  "intent": "take-action | take-special-action | resolve-pending | report-bug",
  "actionId": "可执行 action id 或 null",
  "specialAction": {"cardId": "可见特殊行动卡 id", "actionId": "cut-peat 等", "tile": [row, col]},
  "pending": {"kind": "pending 类型", "choice": "选择"},
  "reason": "为什么这一步优先测试 Moor 规则且能继续游戏",
  "alternatives": [{"intent": "...", "reason": "..."}],
  "observations": ["可疑 UI/log/sync/rule 现象"]
}
```

第一版 player agent 不直接操作浏览器；主 agent 负责把意图转成 Playwright 操作，避免 4 个 agent 同时乱点。

## Agent 编排机制

当前 M0 定稿如下：

- **harness**：`scripts/agent-playtest.ts` 只做 harness——驱动 4 个 Playwright page、执行 UI 操作、写 trace / summary / snapshot；不内嵌 LLM。
- **player agent**：M1 再接入 4 个 player subagent；当前脚本只用启发式策略。
- **通信**：M1 使用 JSON 文件落盘交换——harness 写 `context-p{k}.json`，subagent 回写 `intent-p{k}.json`。
- **调用节奏**：M1 对每个玩家串行调用——轮到 `p_k` 时只发 `p_k` 的视角化 context，拿回 intent 再落子，避免 4 个 agent 并发乱点（与现有 `ws-dual-player.spec.ts` 的单页驱动一致）。
- **视角裁剪**：M1 从全量 state 按 `p_k` 视角过滤，注入的 `privateState` 只含 `p_k` 自己的资源 / 农场 / 手牌 / pending，落盘前断言不含其他玩家手牌或暗牌。

## 运行入口

建议命令：

```bash
./restart-intranet.sh --preview --moor --players 4
FRONTEND_URL=<restart 输出的 preview URL>
pnpm exec tsx scripts/agent-playtest.ts --moor --players 4 --url "$FRONTEND_URL" --out artifacts/agent-playtest/manual
```

当前脚本只跑单局；`--games` / `--agents` 尚未实现，会直接报错。批量多局属于 M2。

复现：当前脚本输出 `trace.json` 和 `snapshots/step-*.json`；先用快照定位，再按 trace 手动复跑关键段。

### 环境与可复现约束

第一版定稿如下：

- **房间来源**：用 `restart-intranet.sh --moor --players 4`（`restart-intranet.sh:69`）的**持久化固定 dev4 Farmers 房间**（SQLite，跨重启存活；`ensureFixedDevRooms` 在后端启动时建好，发牌持久固定）。4 个 page 各用 dev4 房间的 `p1`–`p4` 视角进入。
- **复现锚点 = state 快照，不依赖 seed**：WS 主链路建房 seed 恒为 `undefined`（`ws-server.ts:53`、`room.ts:208`），无法指定 seed，第一版**不**改这条主路径。复现改用 step-0 与关键步的完整 state 快照。dev4 发牌本身持久固定，快照 + 命令序列即可稳定定位。
- **base URL**：`--preview` 用 vite preview + LAN_IP + 独立端口（`restart-intranet.sh:524`），不是 `fixtures.ts` 默认的 `localhost:5173`。harness 必须传 `--url`，也可用 `FRONTEND_URL` 作为默认值。

## 输出目录

所有输出写到 `artifacts/agent-playtest/<run-id>/`。

当前脚本生成：

- `trace.json`：完整命令 trace。
- `summary.json`：本局摘要，含参数、步数、停止原因、最终回合和是否终局。
- `snapshots/step-<n>.json`：关键 state 快照。

尚未生成：`plans.json`、`coverage.json`、`bugs.jsonl`、截图、逐项 scoring breakdown。这些属于 M1/M2。

`artifacts/` 已被 git ignore，输出不进仓库。

## Trace 格式

每一步 trace 至少包含：

```json
{
  "step": 42,
  "round": 5,
  "activePlayer": "p3",
  "playerAgent": "p3",
  "before": {
    "phase": "work",
    "pending": "choice",
    "currentPlayer": "p3",
    "logLength": 81,
    "eventSeq": 146
  },
  "intent": {"kind": "take-action", "actionId": "grain-seeds", "domHint": "grain-seeds"},
  "progressed": true,
  "after": {
    "phase": "work",
    "pending": "confirmNextPlayer",
    "currentPlayer": "p3",
    "logLength": 83,
    "eventSeq": 150
  }
}
```

Trace 必须从新局开始记录，不只记录 bug 附近几步。当前脚本不输出 `bugs.jsonl`；发现问题时用完整 `trace.json` 和最近的 `snapshots/step-*.json` 定位。

## 选择器约定

UI 操作和采集基于已存在的真实选择器，不要新造：

- 行动格：`[data-action-id="<id>"]`（`ActionBoard.tsx:1037` / `1099`）；`<id>` 取自后端 action space id，Trace 示例里的 `grain-seeds` 仅为占位，实际以页面 `data-action-id` 为准。
- 行动格占用态：`.action-card-holder.taken`（见 `ws-dual-player.spec.ts`）。
- ActionLog 行：`[data-testid^="action-log-row-"]`（`ActionLog.tsx:221`，后缀是 `row.key` 不是 step）；容器 `.action-log`、空态 `.action-log__empty`、取消态 class `action-log__entry--canceled` / `action-log__text--canceled`。

## 开局规划

主 agent 在第一步行动前，对每个玩家单独采集：

- Farmers 规则摘要：读取 `output/rules/agricola-re-farmers-rules-summary.md`。
- 基础规则摘要：读取 `output/rules/agricola-re-rules-summary.md`，仅用于未被 Farmers 修改的通用规则。
- 手牌职业、小改的 id、名称、类型、cost、prerequisite、vp、passing、desc / UI 可见文本。
- 初始资源、农场、家庭成员、房间数。
- 当前 major improvement 供应。
- 已揭示行动格、4 人 Farmers 扩展行动格、特殊行动卡列表和 Moor 主要改良供应。

主 agent 注入给 player agent 的上下文必须包含：

- `farmersRulesSummary`: 来自 `output/rules/agricola-re-farmers-rules-summary.md`；至少覆盖特殊行动、森林/沼泽、燃料供暖、病床/Infirmary、马、Moor 主改/小改和计分。
- `baseRulesSummary`: 来自 `output/rules/agricola-re-rules-summary.md`；只补充基础流程、行动格、建房/家庭增长、收获/喂养、农场容量、计分。
- `handCardText`: 该玩家 7 张职业和 7 张小改的完整文字；不能只给 card id / 名称。
- `publicActionContext`: 4 人 Farmers 行动格、特殊行动卡状态、已揭示回合行动格、当前 base + Moor major improvement 供应。
- `privateState`: 只包含该玩家自己的资源、农场、手牌、已打出卡牌和 pending。

接入 player agent 后，每个 player agent 必须输出并写入 `plans.json`：

```json
{
  "player": "p2",
  "rulesContext": {
    "sourcePath": "output/rules/agricola-re-farmers-rules-summary.md",
    "sections": ["special-actions", "forests-and-moors", "heating", "infirmary", "horses", "moor-majors", "scoring"]
  },
  "handCardText": [
    {
      "id": "A131_CraftTeacher",
      "type": "occupation",
      "name": "Craft Teacher",
      "desc": ["..."]
    }
  ],
  "openingPlan": {
    "specialActions": "优先 Cut Peat / Fell Trees / Slash and Burn；有机会测试 2 食物借用对手正面卡",
    "heating": "提前准备 fuel 或 wood->fuel，故意覆盖至少一次供暖结算",
    "horses": "尽早 Horse Market，测试马容纳、繁殖和终局计分",
    "cards": ["M083_CoalSeam", "M127_Wheelbarrow"],
    "farm": "用特殊行动清森林/沼泽，必要时再用基础行动建房/播种",
    "scoring": "Moor 规则覆盖 > 能继续游戏 > 常规得分",
    "coverageTargets": ["cut-peat", "fell-trees", "slash-and-burn", "horse-market", "infirmary", "moor-major"]
  }
}
```

开局规划不是死脚本。主 agent 每轮把最新资源、手牌变化、已用行动、未覆盖行动传回当前 player agent；player agent 可以返回 `planUpdate`，但必须说明为什么偏离原路线。

## 行动覆盖策略

接入 coverage 后，主 agent 维护 `coverage.json`，至少包含：

- `actionSpaces`: 每个 base / 4 人 / round action space 被使用次数、首次使用 step、使用玩家。
- `moorSpecialActions`: 每种特殊行动、每张特殊行动卡、免费/2 食物借用、地形目标类型的覆盖次数。
- `moorSystems`: 森林/沼泽清理、fuel、heating、sick bed、Infirmary、horse、Moor major/minor 的覆盖次数。
- `pendingKinds`: choice、farm-select、feed、animal-reorg、confirm-next-player、moor-special-action-choice 等 pending 覆盖次数。
- `logChecks`: 每步 ActionLog 一致性、重复行、关键行动可读性检查结果。
- `playerDiversity`: 每个玩家使用过的唯一行动格数量、重复行动次数。

覆盖目标：

- 每种可执行特殊行动整局尽量至少使用 1 次；Cut Peat / Fell Trees / Slash and Burn / Horse Market 是硬优先。
- 森林、沼泽、fuel/heating、Infirmary、horse、Moor major supply 至少各覆盖 1 次。
- 每个已揭示且可执行的 base / 4 人行动格，作为 Moor 目标支撑时尽量覆盖。
- 每个回合行动格在揭示后尽量至少使用 1 次。
- 家庭增长相关链路必须主动尝试：`farm-expansion` / 建房 / `wish-children` 或 `urgent-wish-children`。
- 食物、职业、小改、大改、plow、sow、fence、animals、renovation 都应尽量覆盖，除非局面资源确实不允许。

覆盖不能凌驾规则目标：不能为了覆盖故意点明显无收益或破坏继续游戏的路径。覆盖分只是 tie-breaker；Moor 新规则覆盖、供暖/喂养和继续游戏优先。

## Bug 记录格式

M2 接入 `bugs.jsonl` 后，每条一行 JSON：

```json
{
  "id": "run-20260628-001-bug-0007",
  "seed": 12345,
  "players": 4,
  "step": 84,
  "round": 9,
  "player": "p2",
  "severity": "blocking",
  "category": "log",
  "summary": "ActionLog duplicated harvest feed entry",
  "triggerPath": [
    {"step": 80, "player": "p4", "intent": "take fishing"},
    {"step": 81, "player": "p1", "intent": "confirm"},
    {"step": 82, "player": "p2", "intent": "take major improvement"}
  ],
  "expected": "One visible feed conversion row for p2",
  "actual": "Two identical feed conversion rows",
  "repro": "load snapshots/step-084.json, then continue from the recorded trace context",
  "snapshotPath": "snapshots/step-084.json",
  "screenshotPath": "screenshots/step-084-p2.png",
  "uiLogRows": ["..."],
  "stateLogKeys": ["log.action", "log.actionDetail"],
  "eventSummary": ["resource.moved seq=148", "action.detail seq=149"]
}
```

## 问题分类

`category`：

- `rule`：规则结果错误。
- `ui`：UI 显示、按钮、交互错误。
- `log`：行动记录遗漏、重复、顺序、文本、取消态错误。
- `sync`：不同玩家页面状态不一致。
- `crash`：前端或后端异常。
- `stuck`：游戏无法继续。

`severity`：

- `blocking`：当前局无法继续。
- `nonblocking`：记录后继续玩。

## 继续游戏规则

主 agent 发现问题后必须先判断是否还能继续。

继续玩的情况：

- log 文本不合理，但按钮还能操作。
- UI 显示不一致，但刷新或切换玩家后还能继续。
- 规则结果可疑，但 engine 仍有合法下一步。
- 同一类问题重复出现。

停止当前局的情况：

- 页面 crash 或无法恢复。
- 后端命令 crash。
- 当前玩家没有任何可执行 UI 操作，但 session 认为应该行动。
- pending 连续重试后不变化。
- 状态已经损坏到不能安全执行下一步。

非阻塞问题即使重复出现，也要继续玩。接入 `bugs.jsonl` 后，同一 `signature` 可以只写首个完整 bug，后续写 `duplicateOf` 和出现次数。

## 执行兜底与异常处理

防止 harness 永久挂死或空转，必须有硬性 guard：

- 全局：整局总步数上限、整局 wall-clock 上限，超限即判 `stuck` 收尾。
- 单步：player agent 决策超时；返回非法 / 不可执行 intent（行动格已占用、资源不足、按钮 disabled）时，主 agent 回传可执行行动列表让其重选，重选次数封顶，仍失败则记 bug 并按"停止当前局"处理。
- pending：同一 pending 连续重试 N 次状态不变即判 blocking。

## Log 专项检查

每步后主 agent 采集：

- `.action-log` 可见文本。
- `[data-testid^="action-log-row-"]` 行文本、class、顺序。
- `state.log` key 和 params 摘要。
- event timeline 摘要。
- 当前回合头。

必须检查：

- UI log 不应为空，除非 state/event 也没有可显示记录。
- 关键行动至少有一条可读记录。
- 同一行动或卡牌效果不应重复显示同一行。
- newest-first 顺序必须符合 timeline。
- undo/cancel 后，canceled 行要被过滤或显示为 canceled，不能混成正常行动。
- 玩家名、卡牌名、资源数量、行动格名必须可读。
- 4 个玩家页面看到的公共 log 应一致。

## 同步检查

每个完整 action 后，主 agent 对 4 个页面做轻量一致性检查：

- 当前 round 一致。
- 当前玩家提示一致。
- 公共 action board 占用一致。
- `.action-log` 最新 N 行一致。
- 分数/资源只检查当前玩家自己的可见区域，不比较私有手牌。

## Player agent 决策约束

Player agent 优先选择能推进游戏的操作：

1. 当前有 pending，就先处理 pending；如果有多个选项，选择符合路线且最能推进当前目标的选项。
2. 若有可执行特殊行动，优先选择能覆盖 Farmers 新规则且不破坏继续游戏的特殊行动。
3. 保证下一次 harvest 有喂养和供暖方案；缺燃料时优先 Cut Peat 或 wood->fuel，缺食物时优先 Hiring Fair / food / cooking 能力。
4. 根据 Moor 手牌路线选择 Moor 小改 / 主改、Horse Market、Infirmary、森林/沼泽清理，再考虑基础职业、plow、sow、fence、animals、renovation。
5. 若能安全推进家庭增长链路，可以拿建房资源、建房、`grow family`，但不要牺牲 Moor 覆盖。
6. 在多个行动收益接近时，优先选择本局未覆盖或该玩家未尝试过的 Moor 特殊行动 / 扩展系统。
7. 如果连续重复同一个行动格，必须在返回结果里说明原因，例如“供暖缺 fuel”或“特殊行动需要 2 food 借用”。
8. 不为了触发 bug 故意乱点非法按钮；非法路径只作为额外探索，不是第一版主线。

此外，收获阶段（field / feed / breed）不是行动格，但是规则正确性高发区：必须把每个 harvest pending 当作正式决策记录进 trace 与 coverage；喂养前先确认有可行喂养方案，宁可早建 cooking、早囤食物。

每次返回意图使用结构化 JSON；非行动格决策（farm-select 选格子、feed 选兑换、improvement 选卡、harvest 喂养）必须通过 `params` 表达，仅 `actionId` 不足以落子：

```json
{
  "player": "p3",
  "intent": "take-action",
  "actionId": "farm-expansion",
  "params": {"farmCell": [1, 2], "buildType": "wood-room"},
  "reason": "need third room before family growth; also covers farm-expansion",
  "expectedBenefit": ["family-growth", "coverage"],
  "alternatives": [
    {"actionId": "forest", "reason": "wood backup"},
    {"actionId": "lessons-4", "reason": "card route, lower priority"}
  ],
  "planUpdate": null,
  "observations": []
}
```

## 可复现性要求

每个 bug 必须满足至少一种复现方式：

- `snapshots/step-<n>.json` 能到达出问题前一步。
- `snapshotPath` 能直接加载到接近出问题的状态。

如果某 bug 无法稳定复现，仍记录，但必须标记：

```json
{"reproStability": "flaky"}
```

## 完成标准

当前脚本完成后应能做到：

- 单局 4 人可从新局自动玩到终局，除非出现 blocking bug。
- trace 能解释每步是行动格、特殊行动还是 pending。
- 不应出现所有玩家整局固定重复同两个行动格的机械策略。
- pending 和 farm-select 不应让 harness 卡死。
- 输出全部落在 `artifacts/agent-playtest/`。
- 当前脚本至少输出 `trace.json`、`summary.json` 和 `snapshots/step-*.json`。

M1/M2 再补 plans、coverage、bugs、截图、log/sync 比较和逐项 scoring breakdown。

## 验证命令

实现后至少跑：

```bash
./restart-intranet.sh --preview --moor --players 4
FRONTEND_URL=<restart 输出的 preview URL>
pnpm exec tsx scripts/agent-playtest.ts --moor --players 4 --url "$FRONTEND_URL" --out artifacts/agent-playtest/smoke
pnpm run lint
pnpm run build
```
