# Agent Playtest Spec

## 目标

第一版只验证 4 人局。4 个 player agent 各固定扮演一个玩家，主 agent 负责协调、执行、记录、复现材料归档。

核心目标：

- 让 4 个 agent 通过真实 UI 实际玩完一局。
- 持续发现规则、UI、同步、log 显示问题。
- 只要游戏还能继续，就记录问题后继续玩，覆盖中后期和终局。
- 每个问题必须带完整触发路径，后续可以按 seed + trace 复现。

## 非目标

- 第一版不跑 2/3/5/6 人局。
- 第一版不覆盖旧 `LogPanel`，只看当前 `ActionLog`。
- 第一版不做卡牌专项穷举。
- 第一版不要求发现 bug 后自动修复。
- 第一版不把输出文件 commit。

## 角色

### 主 agent

主 agent 是唯一执行者：

- 创建 4 人游戏。
- 打开 4 个 Playwright browser context/page，分别作为 `p1`、`p2`、`p3`、`p4`。
- 在轮到某玩家时，把该玩家当前可见信息交给对应 player agent。
- 执行 player agent 返回的操作。
- 每步后采集 state、UI、log、截图和 trace。
- 判断问题是否 blocking。
- 写入 bug JSONL 和 replay trace。

### Player agent

每个 player agent 只扮演一个玩家：

- 只基于自己的 UI 可见信息、可用按钮、当前提示做选择。
- 不直接访问其他玩家私有信息。
- 返回一个可执行意图，例如“点击 wood action”“选择第一个 minor”“确认当前 pending”。
- 可以报告它观察到的问题，例如按钮看不懂、log 重复、资源显示异常。

第一版 player agent 不直接操作浏览器；主 agent 负责把意图转成 Playwright 操作，避免 4 个 agent 同时乱点。

## 运行入口

建议命令：

```bash
pnpm exec tsx scripts/agent-playtest.ts --players 4 --seed 12345 --out artifacts/agent-playtest/manual
```

批量：

```bash
pnpm exec tsx scripts/agent-playtest.ts --players 4 --games 20 --agents 4 --out artifacts/agent-playtest/batch
```

复现：

```bash
pnpm exec tsx scripts/agent-playtest.ts --replay artifacts/agent-playtest/<run-id>/trace.json
```

## 输出目录

所有输出写到 `artifacts/agent-playtest/<run-id>/`。

必须生成：

- `trace.json`：完整命令 trace。
- `bugs.jsonl`：问题列表。
- `summary.json`：本局摘要。
- `snapshots/step-<n>.json`：关键 state 快照。
- `screenshots/step-<n>-p<k>.png`：关键 UI 截图。

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
  "intent": "take forest",
  "uiAction": {
    "kind": "click",
    "selector": "[data-action-id=\"forest\"]"
  },
  "after": {
    "phase": "work",
    "pending": "confirmNextPlayer",
    "currentPlayer": "p3",
    "logLength": 83,
    "eventSeq": 150
  }
}
```

Trace 必须从新局开始记录，不只记录 bug 附近几步。`bugs.jsonl` 可以额外带 `triggerPath`，截取最近 10-30 步，但 replay 以完整 `trace.json` 为准。

## Bug 记录格式

每条一行 JSON：

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
  "replay": "pnpm exec tsx scripts/agent-playtest.ts --replay artifacts/agent-playtest/run-20260628-001/trace.json --stop-at 84",
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

非阻塞问题即使重复出现，也要继续玩。为了避免刷屏，`bugs.jsonl` 对同一 `signature` 可以只写首个完整 bug，后续写 `duplicateOf` 和出现次数。

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

1. 当前有 pending，就先处理 pending。
2. 有 worker 可放，就选择一个 UI 上可点的行动格。
3. 有多选项时，选一个能完成当前 pending 的最小选择。
4. 到 harvest/feed 时优先避免饿死，但如果 UI 不清楚也要记录问题。
5. 不为了触发 bug 故意乱点非法按钮；非法路径只作为额外探索，不是第一版主线。

## 可复现性要求

每个 bug 必须满足至少一种复现方式：

- `--replay trace.json --stop-at <step>` 能到达出问题前一步。
- `snapshotPath` 能直接加载到接近出问题的状态。

如果某 bug 无法稳定复现，仍记录，但必须标记：

```json
{"reproStability": "flaky"}
```

## 完成标准

第一版完成后应能做到：

- 单局 4 人可从新局自动玩到终局，除非出现 blocking bug。
- 非 blocking bug 不会中断整局。
- `bugs.jsonl` 中每个问题都有 seed、step、player、triggerPath、replay 命令。
- log 问题能区分遗漏、重复、顺序错、文本错、取消态错。
- 4 个玩家页面的公共 log 会被比较。
- 输出全部落在 `artifacts/agent-playtest/`。

## 验证命令

实现后至少跑：

```bash
pnpm exec tsx scripts/agent-playtest.ts --players 4 --seed 12345 --out artifacts/agent-playtest/smoke
pnpm exec tsx scripts/agent-playtest.ts --replay artifacts/agent-playtest/smoke/trace.json
pnpm run lint
pnpm run build
```
