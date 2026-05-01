# BGA 对齐 Master Plan

> **本文件的角色**：基于 `docs/card_desc_audit.md` §8 修复优先级表产出的跨 sprint 主计划。
> 仅本文件是"对齐 BGA"工作的总入口，每个 sprint 自己单独走 brainstorming → spec → plan → 实施。
>
> 关联文档：
>
> - 审查报告：`docs/card_desc_audit.md`（含每张卡 verdict + §8 P0–P3 清单）
> - 进度权威源：`docs/card_progress.md`（每 sprint 收口必须回流）
> - 架构约束：`docs/ENGINE_ARCHITECTURE.md`、根目录 `CLAUDE.md`「卡牌实现规范」

## 0. 概览

- **范围**：审查发现 ⚠ 行为偏差 44 张 + ❌ 数值/元数据 83 张 + 16 张 stub + i18n / category / sharedScoring 系统性问题 + 5 张 P0 玩法完全错。（注：原 audit 报的"getExchangeResources 系统性简化"已 PR-4C 推翻——`player.resources.{animal}` 在我方已聚合 board+supply，等价 BGA `$player->getExchangeResources()`，不是 gap，见 §8 row 4。）
- **非范围**：130 张 P3 简化实现（默认不做，本计划留口子）。
- **总工作量估算**：P0+P1+P2 合计 30 person-day（不含 P3）。
- **单 owner 推荐排期**：5 周完成 P0+P1+P2。
- **冻结基线**：`docs/card_desc_audit.md` §2.4 输入快照（我方 SHA `2b5ddee651...`，BGA SHA `3082e4d358...`）。如基线漂移过大需重启审查。

### Master Plan 收口状态（2026-04-29）

7 个 sprint 全部走完一轮（详见 §8 Sprint 进度表）：

```
Sprint 1   done            30 张 P0 高 ROI 批量（players + cost + prereq）
Sprint 2   done             7 张 P0 玩法完全错 + 2 个机制扩展（onBeforeEndGame hook + future-meeples roomType）
Sprint 2.5 skipped           5 张 BeforeEndOfGame interactive — deliberate divergence (auto-max ≡ player optimum)
Sprint 3   done             1 张 P0 E149 MidnightFencer — deliberate divergence (+K raw VP per owedFence)
Sprint 4   done           178 张 category + 2 张 sharedScoring + PR-4C skipped (audit premise wrong)
Sprint 5   partially done   27/28 张 P1 行为修复（PR-5 7 张 + mech-A 4 张 + mech-D B27 Toolbox + mech-B D117 WoodExpert + mech-E 6 张 + 5b 5 张 + 5c 2 张 A165/B155；同期落地 breed unified effect / Trade.sideEffect.drainSpace / harvest leaf flow / onAfterRoundEnd hook adoption；~1 张 deferred）
Sprint 6   partially done   21 张 extraVp + E30 + D12/D148（i18n 71+437 / 14 张 stub / 双轨重构 deferred）
Sprint 6a  done             6 张 cookery/family/future-meeple stub（C109/C105/D62/D108/D157/E139）+ D92 重写 + 4 通用机制
Sprint 6b  done             effects/ 反模式清理（dead code + 7 helper 迁出 + 4 张 mutation 卡 + 51 caller 迁移）
Sprint 6c  done             D94 HenpeckedHusband + E155 Visionary 两张 stub 卡补实现
Sprint 7   not started     130 张 P3 简化（master plan §0 默认不做）
```

**已修复**：~250 项次（含 Sprint 4 178 张 category 字段批量；不计 deferred）。

**未达 §0 "对齐 BGA 完成"严格判定**（⚠=0 / ❌=0 + Sprint 7 决策已落）：

- ⚠ 残留：~1 张 P1 行为偏差（Sprint 5 deferred — Sprint 5 主路径 + 5b/5c 已累计修 19/28 张外加 mech-* / sideEffect / breed leaf 通用扩展）
- ❌ 残留：12 张 stub 未实现（Sprint 6 deferred；Sprint 6a 实现 6 张 + Sprint 6c 实现 2 张后从 14 → 12）
- i18n 缺口 437 BGA `clienttranslate` 未补（73 张卡内 key 已修，2026-04-30）
- Sprint 7 P3 130 张简化未启动

**Follow-up 路线**：上述 deferred 项作为后续 sprint 单独立项；本 master plan 主体 P0+P1（核心机制 + 关键 bug）已闭环，残留为 P2/P3 范围细节。

详见 `docs/card_progress.md` §2.3 / §2.4 各"deferred to follow-up"小节。

## 1. Sprint 切分

```
P0 ────────────────────────────────────────────
  Sprint 1  P0 高 ROI 批量             (~28 张, 2 day)
            ├─ 11 张 players 字段错（破坏 04-25 落地的卡池过滤，现役 bug）
            │   A154 / A158 / A160 / C151 / C152 / C153 / C163 / E154 / C134 / C158
            │   （+ 重复确认深度池 7 张）
            ├─ 12 张 cost 错
            │   A4 Baseboards（择一→同时付）/ A38 / B4 / B42 / E95 /
            │   C3 / C13 / C33 / C35 / C48 /
            │   D24 / D29 / D39 / D83 / D30 /
            │   E32（stone 误为 clay）/ E34（缺 cost）
            └─ 5+ 张 D 牌组 prereq 注册"白买"bug
                D7 / D8 / D39 / D53 / D58

  Sprint 2  P0 玩法完全错              (6 张, 4 day)
            ├─ B116 Shoreforester（reed bank 准备阶段才给 wood）
            ├─ B14 Hawktower（round 12 预约石屋间）
            ├─ B133 VillagePeasant（给 vegetable 资源而非 VP）
            ├─ D138 PetLover（noop xor 选项要取消原 collect）
            ├─ E134 Omnifarmer（storedTypes 永远不写入 → computeBonusScore 失效）
            └─ A165 round 12 breeding 缺失
            （A135 sharedScoring stub 归 Sprint 4，与 helper 一起修）

  Sprint 3  P0 E149 MidnightFencer     (1 张, 3 day, 独立大卡)
            按 BGA `StartHarvest` listener 实现
            ├─ 第 14 轮跨玩家拿围栏
            └─ 突破 15 上限（cardStates 存 owed 围栏数）

P1 ────────────────────────────────────────────
  Sprint 4  P1 机制 helper             (5 day)
            ├─ sharedScoring 通用扫描（A135 / C136 + 后续单卡复用）
            ├─ ~50 张 category schema 批量映射（B/C/D 三副）
            └─ getExchangeResources helper（D 牌组 8+ 张依赖 pasture/stable 计数）

  Sprint 5  P1 单卡行为偏差            (~28 张, 9 day)
            站在 Sprint 4 helper 之上做单卡修复
            ├─ A 牌组：A129 / A139 / A150 / A151
            ├─ B 牌组：B27 Toolbox / B29 CookeryLesson /
            │           B115 / B130 / B138 / B150 / B152 / B155 +
            │           wide-scan 11 张
            ├─ C 牌组：C23 / C51
            ├─ D 牌组：D18 / D117 / D160
            └─ E 牌组：E53

P2/P3 ─────────────────────────────────────────
  Sprint 6  P2 长尾                    (7 day)
            ├─ 22 张 A 牌组 extraVp 元数据补齐
            ├─ A14 banned 字段 — ✅ 2026-04-30 owner 决议不做（迁入 card_progress.md §2.5）
            ├─ E30 ChildsToy isNewborn 破坏性 mutation 修复
            ├─ D12 ↔ D148 互斥逻辑
            ├─ i18n 缺口（71 + 437 项）
            └─ 16 张 stub（A135 / A165 已含 P0；剩 14 张）

  Sprint 7  P3 简化 130 张              (默认不做, 视情况)
            按需启动；启动时单独 brainstorming
```

## 2. 排期合理性论证

```
1. 风险优先：现役 bug 排在前面
   ├─ Sprint 1 含 11 张 players 字段错，正在破坏 04-25 落地的卡池过滤
   ├─ Sprint 1 含 D 牌组 prereq 注册"白买"bug，玩家不知不觉损失资源
   └─ 不放后面让损害继续

2. ROI 优先：批量元数据 > 单卡修复
   ├─ Sprint 1 的 28 张几乎都是改 1-3 行字段
   └─ 同样 9 day 工作量，Sprint 5 只能修 ~28 张行为偏差
       Sprint 1 的 2 day = ~28 张 ÷ 0.07 day/张
       Sprint 5 的 9 day = ~28 张 ÷ 0.32 day/张

3. 依赖前置：helper 在单卡之前
   ├─ Sprint 4 写完 getExchangeResources helper
   └─ Sprint 5 的 D 牌组 8+ 张直接调用，避免重复写八遍 fallback

4. 玩家可见度爬升
   Sprint 1（隐性 bug）→ Sprint 2（最离谱）→ Sprint 3（最大单卡）→ Sprint 5（细节）
   不会一开始大改观感再回头补细节

5. 每个 sprint 单独循环
   ├─ 每 sprint 一次 brainstorming + spec + plan + 实施
   ├─ PR 大小可控（≤30 张/PR）
   └─ 避免一个超大 plan 跑两周中途方向漂移
```

## 3. 每个 Sprint 的 Definition of Done

```
1. 行为正确性
   ├─ 每张卡至少 1 个 session 测试（GameSession 调 takeAction，断言 state/pending/log/scores）
   ├─ 不允许只看 desc / 单元测试通过就交付
   └─ 修复后跑回归：pnpm test:fast + 受影响领域的 slow project 子集

2. BGA 对齐溯源
   ├─ 每张卡的 PR/commit 引用对应 BGA `.php` 文件路径与行号
   └─ 偏离 BGA 的任何取舍写进 docs/card_progress.md §2.5（"刻意不同"），含 owner 签字

3. 文档同步（CLAUDE.md 硬性要求）
   ├─ docs/card_progress.md §2 加 changelog 行 + §2.3 / §2.4 / §2.6 迁出对应卡
   ├─ docs/card_desc_audit.md §8 把已完成项打勾或注 commit hash
   └─ §1 总览数字同步（深度池 ⚠ 数 / ❌ 数 / 简化数）

4. 架构纪律（CLAUDE.md「卡牌实现规范」）
   ├─ 单卡修复不能改 pay.ts / improvement.ts / game-session.ts 的针对性分支
   ├─ 走 hook / cardStates / 已有扩展点；新增扩展点必须同时补测试 + 文档
   └─ 不在前端补规则

5. CI 全绿
   ├─ pnpm run lint（0 error；不引入新 warning）
   ├─ pnpm test:fast 全过
   ├─ pnpm run build 通过
   └─ push 后等到 GitHub Actions 全绿才算 sprint 收口

6. PR 大小可控
   ├─ ≤ 30 张卡/PR；超过 30 张必须分多 PR
   └─ helper / 机制级修复独立 PR，不与单卡修复混
```

## 4. 修复边界与扩展点

```
问题类型                修复位置                          禁止动的地方
──────────────────────────────────────────────────────────────────────
players 字段错        ┃ 卡牌文件 1 行                  ┃ —
                      ┃ shared/cards/X/Xnnn.ts          ┃
──────────────────────────────────────────────────────────────────────
cost / vp / 元数据    ┃ 卡牌文件 cost / vp / banned    ┃ pay.ts
                      ┃ 字段                            ┃
──────────────────────────────────────────────────────────────────────
prereq "白买"        ┃ shared/cards/prerequisite-      ┃ improvement.ts
(D7/D8/D39/D53/D58)   ┃ registry.ts 加注册项           ┃ 不要为单卡加 if
──────────────────────────────────────────────────────────────────────
玩法完全错 5 张      ┃ 卡内 listener / effect 重写    ┃ game-session.ts
B116/B14/B133/D138    ┃ 走现有 hook phase              ┃ 不加 cardId 分支
/E134                 ┃ (before/computeReplace/...)    ┃
──────────────────────────────────────────────────────────────────────
sharedScoring 不齐   ┃ 通用扫描：全仓 grep            ┃ —
A135 / C136 + 后续    ┃ sharedScoring=true 但缺        ┃
                      ┃ computeBonusScore 的卡         ┃
                      ┃ → 各自卡内补                   ┃
──────────────────────────────────────────────────────────────────────
category 字段批量    ┃ 单一脚本扫描 + 卡内补          ┃ 不引入新机制；纯字段
~50 张 B/C/D          ┃ 字段（仅展示用）               ┃
──────────────────────────────────────────────────────────────────────
getExchangeResources ┃ 新增 shared/cards/helpers/     ┃ 不动 exchange 主路径；
8+ 张 D 牌组          ┃ animal-counting.ts             ┃ helper 是纯函数
                      ┃ helper 函数；卡内调用          ┃
──────────────────────────────────────────────────────────────────────
E149 MidnightFencer  ┃ 卡内 listener；按 BGA          ┃ 围栏数主路径不动
                      ┃ StartHarvest 写完              ┃ 解 15 上限走卡内
                      ┃ + cardStates 存 owed 围栏      ┃ flag
──────────────────────────────────────────────────────────────────────
单卡行为偏差        ┃ 卡内 listener 调整              ┃ —
A129/A139/A150/...    ┃                                 ┃
B27/B29/B115/...      ┃                                 ┃
──────────────────────────────────────────────────────────────────────
i18n 缺口           ┃ src/i18n/{zh,en}.ts             ┃ 不阻塞游戏；可缓
71 + 437 项           ┃ 直接补 key                      ┃
──────────────────────────────────────────────────────────────────────
stub / 未实现       ┃ 卡内 effect/listener 实现       ┃ —
A135/A165/C62/...     ┃                                 ┃
```

**新建文件清单（master plan 范围内允许的新增）：**

```
shared/cards/helpers/animal-counting.ts        # Sprint 4 — getExchangeResources
shared/cards/helpers/shared-scoring.ts         # Sprint 4 — 复用模式 ≥3 处再抽
docs/superpowers/specs/<each-sprint>.md        # 每个 sprint 一份 spec
docs/superpowers/plans/<each-sprint>.md        # 每个 sprint 一份 plan
```

**helper 新建条件：**

```
✓ 仅在「≥ 3 张卡复用同一模式」时才允许新建 helper
  → 避免给一卡造一 helper
  → 适用范围：getExchangeResources（D 牌组 8+ 张依赖）、sharedScoring（A135/C136 + 后续）
```

**绝不允许的事：**

```
✗ 在 pay.ts / improvement.ts / game-session.ts 加 cardId 分支
✗ 在前端补规则裁定（即使是显示性的 desc 修复）
✗ 创建集中"卡牌效果注册表"绕开 hook
✗ 单卡修复 PR 内夹带无关重构
✗ 跨 sprint 合并修复（保 PR 大小 + 边界清晰）
```

## 5. 测试策略

```
Sprint              测试形态                                    样本判定
─────────────────────────────────────────────────────────────────────────
Sprint 1            ┃ 元数据/cost/players：                    ┃ 28 张
P0 高 ROI 批量      ┃   — 表驱动 unit 测：每张卡断言            ┃
                    ┃     CARD.cost.equals(...)                 ┃
                    ┃     CARD.players === '4+'                 ┃
                    ┃   — 卡池过滤回归：跑现有 04-25 卡池       ┃
                    ┃     过滤测试，断言 11 张不再误进 3p 池    ┃
                    ┃ prereq 注册：                             ┃
                    ┃   — session 测：尝试 buy D7/D8/...，      ┃
                    ┃     断言 prereq 未满足时 ok=false         ┃
                    ┃     断言 prereq 满足时 onBuy 触发         ┃
─────────────────────────────────────────────────────────────────────────
Sprint 2            ┃ 每张卡 ≥ 2 个 session 测试：              ┃ B116: 准备阶段
P0 玩法完全错 5     ┃   — 触发条件正确（BGA 流程）             ┃ 才给 wood vs
                    ┃   — 不该触发的场景不触发                 ┃ 任意 round 都
                    ┃ 必须包含 BGA 引文做对照                   ┃ 给的反例
─────────────────────────────────────────────────────────────────────────
Sprint 3            ┃ 围绕 round 顺序的 session 测：           ┃ round 14 触发
E149 MidnightFencer ┃   — 第 14 轮 StartHarvest 触发            ┃ + 跨玩家围栏
                    ┃   — 跨玩家拿围栏顺序                     ┃ + 突破 15 上限
                    ┃   — 突破 15 上限                          ┃ ≥ 3 个测试
─────────────────────────────────────────────────────────────────────────
Sprint 4            ┃ helper 单元测试 + 现有受影响卡的         ┃ getExchangeResources
P1 机制 helper      ┃ 回归测试：                                ┃ helper：
                    ┃   — getExchangeResources：mock pasture/   ┃   — 单元 5+ 用例
                    ┃     stable，验证动物计数                  ┃   — D 牌组 8 张
                    ┃   — sharedScoring 通用模式：A135/C136     ┃     已有测试不破
                    ┃     先回归再补                            ┃
                    ┃   — category schema 仅 unit 测            ┃
─────────────────────────────────────────────────────────────────────────
Sprint 5            ┃ 每张卡 ≥ 1 个 session 测，依赖 Sprint 4   ┃ 28 张 ≥ 28 个
P1 单卡偏差         ┃ helper 的卡测调用 helper（不重复 mock）   ┃ session 测试
─────────────────────────────────────────────────────────────────────────
Sprint 6            ┃ extraVp / banned / E30 / D12↔D148：      ┃ 长尾，按需
P2 长尾             ┃ session 测；i18n 用现有翻译完整性 lint    ┃
─────────────────────────────────────────────────────────────────────────
Sprint 7            ┃ P3 简化 130 张 — 视情况；这一 sprint     ┃ 默认不加测
                    ┃ 不属于硬性范围                            ┃
```

**反"假绿"机制：**

```
1. 每个 sprint 开工前先写"红测"
   → 让每张卡当前的 bug 行为先在测试里复现并失败
   → 再修，看到红 → 绿，证明测试真测到了 bug
   → 防止"修了但测试没真覆盖"

2. 测试断言层级（按重到轻）
   ✓ 断言 GameSession 返回的 state / pending / log / scores
   ✗ 断言 DOM 元素 / 按钮文案 / 页面结构
   ✗ 断言"effect 函数被调用"（mock 验证调用）

3. PR 评审硬要求
   → 每张修复卡必须能指向"红 commit + 绿 commit"
   → 不允许"补测试时直接写绿"
```

## 6. 依赖图、并行机会、时间估算

```
依赖关系（DAG）
────────────────────────────────────────────────────────
Sprint 1 ──┐
           ├──► （并行无依赖）
Sprint 2 ──┘

Sprint 3 ── 独立大卡（与 Sprint 1/2 可并行）

Sprint 4 ──► Sprint 5 （helper 必须先完工）

Sprint 6 ── 独立长尾（任何时点可插）
Sprint 7 ── P3 视情况，可不做
```

```
工作量估算（基于 audit §8 的 day 数 ×1.3 安全系数）
─────────────────────────────────────────────
Sprint 1   28 张元数据/cost/prereq      2 day    （≈3 person-day）
Sprint 2   5 张玩法 + A165/A135           4 day    （≈4 person-day）
Sprint 3   E149 MidnightFencer            3 day    （≈3 person-day）
Sprint 4   3 个 helper                    5 day    （≈5 person-day）
Sprint 5   28 张单卡偏差                  9 day    （≈9 person-day）
Sprint 6   P2 长尾                        7 day    （≈7 person-day）
Sprint 7   P3 130 张                      视情况   （15-20 person-day, 默认不做）
─────────────────────────────────────────────
P0 总     Sprint 1+2+3                   9 day
P0+P1     Sprint 1-5                    23 day
全做      Sprint 1-6                    30 day
含 P3                                   45-50 day
```

```
路径 A：单线串行（推荐）
───────────────────────────────────────
Week 1   Sprint 1 → Sprint 2 (P0 元数据 + 玩法 bug)
Week 2   Sprint 3 → Sprint 4 (E149 + helper)
Week 3-4 Sprint 5             (P1 单卡 28 张)
Week 5+  Sprint 6             (P2 长尾)

→ 单 owner 适用；每周一个里程碑可见

路径 B：双线并行（如有 2 owner）
───────────────────────────────────────
Week 1   Sprint 1 ‖ Sprint 4(helper)
Week 2   Sprint 2 ‖ Sprint 4 收尾
Week 3   Sprint 3 ‖ Sprint 5 启动
Week 4   Sprint 5 ‖ Sprint 6
Week 5   Sprint 6 收尾

→ 5 周内 P0+P1+P2 全清；需要两个 owner 不冲 PR 主题
```

**里程碑：**

```
M1  Sprint 1 done  → 11 张 players 字段错修复，卡池过滤恢复正确
M2  Sprint 2 done  → 5 张玩法完全错玩家可感知正常
M3  Sprint 3 done  → E149 第一次可玩
M4  Sprint 4 done  → 3 个 helper 上线（不可见，但 Sprint 5 解锁）
M5  Sprint 5 done  → P1 单卡 28 张全部对齐 BGA
M6  Sprint 6 done  → audit §8 仅剩 P3，可宣布"对齐 BGA 完成"
```

**风险点：**

```
R1  Sprint 4 helper 设计可能改变 sharedScoring 通用模式
    → 缓解：写 helper 之前再起一次小 brainstorming 决定接口形态

R2  Sprint 5 跨 sprint 撞 helper 接口
    → 缓解：Sprint 4 helper 接口 freeze 之后才能开 Sprint 5 brainstorming

R3  Sprint 7 P3 130 张简化是否做
    → 默认不做；本 master plan 留出口子，未来按需启动

R4  并行路径 B 的 PR 撞工
    → Sprint 1 改卡定义字段、Sprint 4 改 helper 文件，互不干扰，可放心并行
```

## 7. 进度同步与文档约定

```
权威文档分工（CLAUDE.md 已钉死，本计划遵守，不新建文档）
─────────────────────────────────────────────────────
docs/card_progress.md       卡牌实现进度的唯一权威源
docs/card_desc_audit.md     本次审查报告 + 历史快照
docs/superpowers/specs/     每个 sprint 的 spec
docs/superpowers/plans/     每个 sprint 的 plan
docs/master-plan.md         本 master plan
```

**每个 sprint 收口必做的回流（PR 内同 commit）：**

```
1. docs/card_progress.md
   ├─ §2 当前轮次：加 1 行 changelog
   │   "YYYY-MM-DD Sprint N done — N 张卡（cardId 列表）— 一句摘要 — commit hash"
   ├─ §2.3 行为偏差：迁出本 sprint 修复的卡
   ├─ §2.4 数值/元数据：迁出本 sprint 修复的卡
   ├─ §2.5 刻意不同：本 sprint 新增的取舍登记（含 owner 签字）
   ├─ §2.6 stub：迁出本 sprint 实现完毕的卡（A135 / A165 / E149 / ...）
   ├─ §1 总览：实现数 / Tier 数同步
   └─ §7 基础设施：本 sprint 新增的通用机制登记（如 Sprint 4 helper）

2. docs/card_desc_audit.md
   ├─ §8 修复优先级表：对应行加注 commit hash 或打勾 ✅
   └─ §1 总览数字：⚠ 数 / ❌ 数 / 简化数同步减少

3. docs/master-plan.md（本文件）
   └─ §8 Sprint 进度表标记 done + 实际工时（用于校准后续估算）
```

**Sprint 启动前必做的更新（避免 spec 与最新代码漂移）：**

```
对应 sprint 的 brainstorming 启动后第一件事：
  → Read docs/card_desc_audit.md §4-§5 对应卡 verdict 段
  → Read docs/card_progress.md §2.x 对应批次
  → 验证：本 sprint 范围内的卡列表与 audit 仍然一致
       （如他人在 master plan 之后已修过其中部分卡 → 移出 sprint 范围）
```

**"对齐 BGA 完成"判定：**

```
docs/card_desc_audit.md §1 总览数字降到：
  ⚠ 行为偏差 0 张
  ❌ 数值/元数据 0 张
  + Sprint 7 决策已落（修 / 不修 / 部分修）

满足 → docs/card_progress.md §2.0 加 milestone 行
     "YYYY-MM-DD BGA alignment complete (P0+P1+P2)"
```

**绝不允许的事：**

```
✗ 新建 docs/audits/* 或 docs/sprint-N-status.md 等并行文档
✗ master plan 文档与 audit / progress 出现总览数字不一致
✗ 把 sprint 收口 PR 合掉而不回流文档（拒合）
```

## 8. Sprint 进度表

> 每个 sprint 收口后填本表，含实际工时用于校准估算。

| Sprint | 主题                                                                    | 张数                                                        | 估算    | 实际                       | 状态                                                                                                                                                                                                                  | Spec                                                             | Plan                                                      | PR/Commit             |
| ------ | --------------------------------------------------------------------- | --------------------------------------------------------- | ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| 1      | P0 高 ROI 批量（players + cost + prereq）                                  | 30 (10 players + 16 cost/vp + 5 D-prereq, D39 overlap −1) | 2 day | ~2 day                   | done（PR-1A 10 张 players ✅、PR-1B 16 张 cost/vp ✅、PR-1C 5 张 D-deck prereq ✅）                                                                                                                                           | docs/superpowers/specs/2026-04-29-sprint-1-p0-batch-design.md    | docs/superpowers/plans/2026-04-29-sprint-1-p0-batch.md    | #25 / #26 / #27       |
| 2      | P0 玩法完全错 + audit 顺带（B116/A165/B133/D60/B14/D138/E134；A135 移 Sprint 4） | 7 + D60 顺带                                                | 4 day | ~5 day                   | done（PR-2A 4 cards + onBeforeEndGame hook ✅、PR-2B B14 + future-meeples roomType ✅、PR-2C D138 computeReplace ✅、PR-2D E134 三 hook ✅）                                                                                  | docs/superpowers/specs/2026-04-29-sprint-2-p0-gameplay-design.md | docs/superpowers/plans/2026-04-29-sprint-2-p0-gameplay.md | #28 / #29 / #30 / #31 |
| 2.5    | BeforeEndOfGame interactive choice（A136/C133/C99/D132/E132）           | 5                                                         | 4 day | 0                        | **skipped — registered as deliberate divergence**                                                                                                                                                                   | —                                                                | —                                                         | —                     |
| 3      | P0 E149 MidnightFencer                                                | 1                                                         | 3 day | ~1.5 day                 | done（implemented as deliberate divergence — onStartHarvest offers 0..2×(N−1), each owedFence = +1 raw VP；BGA fence-segment placement 待 fence 系统重写）                                                                  | docs/superpowers/specs/2026-04-29-sprint-3-e149-design.md        | —                                                         | #34                   |
| 4      | P1 机制 helper（sharedScoring + category + getExchangeResources）         | 178 cards (category) + 2 cards (sharedScoring)            | 5 day | ~1 day                   | done（PR-4A A135/C136 sharedScoring ✅、PR-4B 178 cards category alignment ✅、PR-4C **skipped** — audit premise wrong: `player.resources.{animal}` already aggregates board+supply, no helper needed）                   | —                                                                | —                                                         | #35 / #36             |
| 5      | P1 单卡行为偏差                                                             | 28                                                        | 9 day | ~0.5 day (PR-5) + ~1 day (mech-A) + ~0.5 day (mech-D) + ~0.5 day (mech-B) + ~3h (stub-test-infra) + ~0.5 day (mech-C) + ~1 day (mech-E) + ~1.8 day (5b) + ~1 day (5c) + ~0.5 day (mech-E follow-up) | partially done (27/28; PR-5 7 张 + mech-A 4 张 + mech-D 1 张 + mech-B 3 张 + stub-test-infra + mech-C 1 张 (E53 BoarSpear via exchange rename) + mech-E 6 张 (B115/C13/B29/B138/C51/A151) + 5b 5 张 (C23/A38/A1/A22/E16) tail-fixes + 5c 2 张 (A165/B155) + gain action 三合一 + viaCardJump worker-less + BonusModifier conditions 评估扩展 + stables actionContext.zoneFilter/max + fencing computeFenceFreeAvailable hook + breed unified effect + Trade.sideEffect.drainSpace + harvest leaf flow + onAfterRoundEnd hook adoption; remaining ~1 deferred — see card_progress.md §2.3 "Sprint 5 PR-5 deferred" subsection)（**Bonus.conditions / BonusChoice.conditions follow-up 已修 2026-05-01**：computeAllBuyableCombinations 路径补齐评估；payment.ts:523-527 TODO 删除；C13 listener 迁移因引擎 generic computeCosts 路径不消费 listener bonuses 字段而偏离，保留 BonusModifier 实现并补 outcome-level boundary case 验证 conditions 链路。详见 `docs/card_progress.md` §2.0 "2026-05-01 Bonus.conditions" 条目） | docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md + docs/superpowers/specs/2026-04-30-sprint-5-mech-d-turn-edge-phase-design.md + docs/superpowers/specs/2026-04-30-sprint-5-mech-b-alternative-cost-trades-design.md + docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md + docs/superpowers/specs/2026-04-30-sprint-5-mech-c-exchange-rename-boar-spear-design.md + docs/superpowers/specs/2026-04-30-sprint-5-mech-e-misc-fixes-design.md + docs/superpowers/specs/2026-04-30-sprint-5b-tail-fixes-design.md + docs/superpowers/specs/2026-05-01-sprint-5c-a165-b155-design.md + docs/superpowers/specs/2026-05-01-bonus-conditions-eval-design.md | docs/superpowers/plans/2026-04-30-sprint-5-mech-a-place-farmer.md + docs/superpowers/plans/2026-04-30-sprint-5-mech-d-b27-toolbox-turn-edge.md + docs/superpowers/plans/2026-04-30-sprint-5-mech-b-alternative-cost-trades.md + docs/superpowers/plans/2026-04-30-sprint-5-stub-test-infra.md + docs/superpowers/plans/2026-04-30-sprint-5-mech-c-exchange-rename-boar-spear.md + docs/superpowers/plans/2026-04-30-sprint-5-mech-e-misc-fixes.md + docs/superpowers/plans/2026-04-30-sprint-5b-tail-fixes.md + docs/superpowers/plans/2026-05-01-sprint-5c-a165-b155.md + docs/superpowers/plans/2026-05-01-bonus-conditions-eval.md | sprint-5-batch / sprint-5-mech-a-place-farmer / sprint-5-mech-d-turn-edge-phase / sprint-5-mech-b-alternative-cost-trades / sprint-5-stub-test-infra / sprint-5-mech-c-meeple-id / sprint-5-mech-e-misc-fixes / sprint-5b-tail-fixes / sprint-5c-b155-bdeck-batch |
| 5c     | A165 PigBreeder + B155 ArtTeacher 完整对齐 + 4 处通用扩展（breed effect / Trade.sideEffect.drainSpace / CardEffect.onAfterRoundEnd / harvest leaf flow） | 2 cards + 4 infra | 1.5-2 day | ~1 day                  | done（A165 onAfterRoundEnd + breedLeaf；B155 computeCosts trade with sideEffect.drainSpace；breed unified effect + breedAction；harvest path migrated to engine leaf flow；Trade.sideEffect dispatcher data-driven；onAfterRoundEnd hook 已存在仅 A165 接入） | docs/superpowers/specs/2026-05-01-sprint-5c-a165-b155-design.md | docs/superpowers/plans/2026-05-01-sprint-5c-a165-b155.md | sprint-5c-b155-bdeck-batch |
| 6      | P2 长尾（extraVp + banned + E30 + D12↔D148 + i18n + stub）                | ~50 + i18n                                                | 7 day | ~1.5 hour (PR-6 partial) | partially done（21 A-deck extraVp metadata + E30 ChildsToy non-destructive mutation + D12↔D148 mutual exclusion；A14 banned ✅ 2026-04-30 owner 决议不做（迁入 §2.5）；i18n 71+437 deferred；14 stub 中 6 张 Sprint 6a 实现 + 2 张 Sprint 6c 实现，剩 6 张 deferred — 见 card_progress.md §2.0 "Sprint 6 partial done" + "2026-04-30 A14 banned" + "2026-05-01 Sprint 6c" 条目） | —                                                                | —                                                         | sprint-6-batch        |
| 6a     | Cookery exchange metadata 化 + 6 张 stub 卡 + family-growth 统一 + special-effect dispatcher | 6 + 4 mech | 3.3-3.6 day | ~0.5 day | done（C109 / C105 / D62 / D108 / D157 / E139 6 张 stub 实现 + D92 重写 + 4 通用机制：cookery `exchanges` metadata 字段统一、harvest selector 通用化（entry-index + 双向 apply）、`family-growth` action 统一、`special-effect` mutation dispatcher） | docs/superpowers/specs/2026-04-30-sprint-6a-cookery-trades-batch-design.md | docs/superpowers/plans/2026-04-30-sprint-6a-cookery-trades-batch.md | sprint-6a-cookery-trades-batch |
| 6b     | effects/ 反模式清理 + 6a follow-up（4 batch + 2 收尾） | 0 cards (infra-only) + 4 mutation cards (E149 / E38 / D134 / C104) + 18 trigger 数组化 + 51 caller 迁移 | 6.5-8 day | ~1 day | done（dead code 删除 + 7 helper 文件迁出 effects/ + ad-hoc registry 基础设施 + 4 张单卡 effect 内联 + 51 caller `flag-card`/`unflag-card`/etc → `special-effect` + 4 张 mutation pattern 卡 listener-mutate 修复（E149/E38/D134/C104）+ `special-effect.actionContext.targetPlayerId` 跨玩家路由 + `bonus-vp` 同步路由 + 18 张 `trigger:` 单数迁移 `triggers:[]` + `CardExchange.trigger` 字段删 + E53 BoarSpear listener-only `triggers:[]` + `CanBeExecutedByPlayerContext.actionContext` 透传。effects/ 文件数 63 → 45（接近 BGA 22 + 必要扩展）） | docs/superpowers/specs/2026-04-30-sprint-6b-effects-cleanup-design.md | docs/superpowers/plans/2026-04-30-sprint-6b-effects-cleanup.md | sprint-6b-effects-cleanup |
| 6c     | D94 + E155 stub 卡补实现 | 2 cards (D94 HenpeckedHusband / E155 Visionary) | 0.8 day | ~0.5 day | done（D94: `phases:['after']` + `actions:['construct']` listener，placement === 2 时触发 `return-first-worker-home`，meeting-place 例外靠 action 自身 `MEETING_PLACE_IDS` 判定；E155: `isDoable` phase listener `actions:['family-growth']`，round<11 + 任一对手 `familySize===2` 时返回 `{doable:false}` 阻断，覆盖 6a 已统一的所有 family-growth 入口；onBuy round≤4 资源保留。0 主路径改动、0 hook/action 新增。9 例 session 测试。card_progress.md §1 总览 828→830/892 = 93.0%，§2.7 stub 列表 strikethrough。） | docs/superpowers/specs/2026-05-01-sprint-6c-d94-e155-design.md | docs/superpowers/plans/2026-05-01-sprint-6c-d94-e155.md | c396266b / ad63a216 |
| 7      | P3 简化 130 张                                                           | 130                                                       | 视情况   | —                        | not started                                                                                                                                                                                                         | —                                                                | —                                                         | —                     |
