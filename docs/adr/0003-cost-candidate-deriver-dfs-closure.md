# 3. Cost Candidate Deriver: DFS closure instead of BGA topo ordering

- Status: Accepted
- Date: 2026-06-05
- Related PRD: GitHub issue #253

## Context

BGA 的 `ComputeCardCosts` 使用 `costs.trades` 作为费用候选列表，并通过 card-level topo ordering 控制 replacement 与 modifier 的先后顺序。`D117_WoodExpert` 依赖这个模型：它遍历当前已有候选，给每个含 wood 的候选追加一个“最多少付 2 wood，多付 1 food”的新候选。

OA 已有的 payment pipeline 中，`Trade` 表示资源替换或资源池转换，不等同于 BGA 的费用候选行。直接把 D117 建模为 `food -> wood` trade 会让普通 printed cost 场景可用，但无法表达“其它卡先派生出含 wood 的费用候选，D117 再继续派生”的组合语义。

同时，OA 不希望复制 BGA topo ordering。全局排序会让新卡需要在多处声明相对顺序，违背卡牌实现局部闭环和简洁优先。

## Decision

引入 **Cost Candidate Deriver**：一种只基于已有成本候选行追加新成本候选行的卡牌能力。

card purchase 的候选派生采用 DFS/backtracking closure：

1. 从 base `fee/fees` 展开成本候选行。
2. 对每条 base candidate 应用所有强制 `costs` delta，clamp 到 0 并 normalize，作为 DFS 起点。
3. 对每个 DFS candidate，尝试所有尚未在当前 branch 应用过的 deriver effect。
4. 每个 deriver 可返回 0-N 条新候选；返回 0 表示当前候选上不适用。返回多条候选时，每条子分支都标记该 deriver 已应用，防止同一 deriver 在自身派生结果上重复应用。
5. 原候选永远保留；deriver 只追加候选，不删除原候选。
6. 派生结果不得包含负 cost。会产生负 cost 时 deriver 必须返回 `[]` 表示当前候选不适用；若实际返回负 cost，框架直接报错，不静默过滤。
7. DFS 完成后、bonus 枚举前，只合并 normalized cost、原始 `feeIndex`、`metadata.sourceCards` 都相同的 duplicate candidate；candidate 阶段不做 domination / Pareto 剔除。更贵候选仍保留进入后续 payment solver，以对齐 BGA 的候选追加语义。
8. 玩家可见 payment options 仍走 payment solver 的 `keepOnlyOptimals`。这对齐 BGA 的两层模型：`computeAllBuyableCombinations()` 生成候选，`argsPay()` 展示前调用 `keepOnlyOptimals()`。
9. Deriver 只输出来源卡 provenance。支付选项 UI 复用现有 `sourceCards` 显示，不允许 deriver 提供每卡自定义 label 文案。
10. `ComplexCost` 用 `costCandidateSourceCards` 保存与派生后 `fees` 同下标的 candidate provenance，用 `costCandidateFeeIndices` 保存派生后 candidate 到原始 printed fee index 的映射；`PaymentSolution`、choice `labelParams` 和 `effectPreview` 用 `sourceCards` 暴露给支付选择 UI。
11. Candidate provenance 不是规则输入。卡牌不应根据 candidate 来源触发后续规则效果。
12. `bonusUsed` 仍只表示 `BonusModifier.sources`。支付日志沿用现有 `resource.paid.bonusSources` / action-detail 展示通道来显示参与支付的卡牌来源，但 `PaymentSolution.sourceCards` 与 `bonusUsed` 在 payment solver 内保持独立。
13. 多个 deriver 来源按首次出现顺序去重；顺序只影响 UI/日志可读性，不参与规则 key。DFS `visited` key 不包含 `sourceCards`，但包含 `feeIndex`、normalized cost dimensions 和 branch-local applied deriver ids；最终 duplicate key 包含 `feeIndex` 和 `sourceCards`，避免把相同费用的 printed path 与 deriver path 混同。
14. Deriver 可以读取只读 target context（`actionId`、`targetCardId`、`targetPlayKind`、`targetCardTypes`、`actionCardId`）做适用性判断，但不能回读目标卡 printed/base cost 来决定是否派生。费用派生必须基于当前 candidate cost。`targetPlayKind` 表示本次 major/minor 支付路径，来自最终选择的 payment path，不来自行动入口声明；`targetCardTypes` 表示卡牌规则身份集合，由 primary type + `alsoCountsAs` 生成，可同时包含 major 和 minor。第一版 improvement 上下文只保留 `major` / `minor`，过滤非 improvement 类型。顺序固定为 primary type 在前、`alsoCountsAs` 按定义顺序追加并去重，不表示规则优先级。
15. Deriver effect id 必须全局唯一；完整收集后统一校验，遇到重复 id 直接报错，并报告重复 id 与来源 listener/card。
16. 每个 deriver 声明非空 `sourceCardId`，框架在成功派生候选时自动追加来源；card-level listener 返回的 deriver 默认必须使用当前 `ownerCardId`，helper 由调用卡显式传入来源。第一版 deriver 返回值只包含 `cost`，不携带 metadata 或 `feeIndex`，卡牌实现不手写自身 `metadata.sourceCards`。
17. 派生 `{ cost: {} }` 合法，表示免费候选；不适用必须返回空数组。
18. 派生与输入完全相同的 normalized cost 合法；该 deriver 仍在 branch 上标记为已应用。若来源或 fee identity 不同，最终仍保留为不同 candidate path。
19. 相同 cost 但来源或原始 fee identity 不同的 candidate 不合并；printed duplicate cost 不应被显示为使用了 deriver。
20. `derive()` 不能用异常表示“不适用”；不适用必须返回 `[]`，异常代表机制错误并向上暴露。
21. 机制错误直接抛 `Error`，不转成游戏内可恢复 fail；message 必须包含 `candidateDeriver` 和 deriver/listener/source 定位字段。
22. `candidateDerivers` 只允许 `computeCosts` phase 返回；其它 phase 返回时直接报错，不静默忽略。
23. 第一阶段 `candidateDerivers` 只支持 `actionId=improvement`；其它 cost path 返回该字段直接报错。
24. `targetCardTypes` 过滤后必须非空；无法从 registry/helper 为 `targetCardId` 生成 improvement 类型集合时直接报错。
25. 代码类型名使用 `CostCandidateDeriver`，不使用临时 spec 名 `CostTransform`。公共类型放 shared 层独立文件，DFS closure 实现放 payment internal，避免 hooks 反向依赖 payment internals。
26. `derive()` 是纯同步函数，只读 candidate 和 target context；不能读写 state、player resources、metadata、随机数、外部服务或 affordability。
27. 收集顺序沿用现有 listener 匹配顺序和 listener 返回数组顺序，不引入 topo/global sort。DFS 对每个 candidate 先 emit 原候选，再按收集顺序尝试 deriver；顺序只影响 first-seen 来源展示。
28. `costs` delta 按现有 listener 顺序逐个 `applyCostOverride` 到每条 base candidate，每步 clamp 到 0；它不是 deriver，不保留未应用分支。
29. `ComplexCost` 先展开 `fee/fees` 并保留 `feeIndex`，再跑 `costs` delta 和 deriver；`bonuses` / `trades` 仍由现有 solver 在候选闭包之后处理。
30. DFS `visited` 命中时不递归，但必须把新路径的 `sourceCards` union 到已存在 candidate；最终 duplicate merge 只处理 cost、fee identity、sourceCards 都相同的重复 candidate。
31. normalized cost key 去 0，并按所有成本维度稳定排序；未来 card token / supply token 也作为成本维度处理，不做 domination。
32. 不设置额外业务 cap。爆炸控制依赖 deriver 数量上限、visited key 和 duplicate 合并；非法状态直接抛错，不静默截断。
33. 实现 PR 需要同步 `docs/ARCHITECTURE.md` 和 `docs/card_implementation_status.md`；旧卡迁移只自动创建审计 issue，不在机制 PR 中批量整改。

该 closure 不保留 BGA 单一排序语义。若两个 deriver 非交换，OA 会接受生成比 BGA topo 更多候选的可能性。

## Consequences

正面：
- 新卡只声明局部派生规则，不维护全局排序。
- D117 能基于 base cost、altCosts、以及其它 deriver 生成的含 wood 候选继续派生。
- D117 不读取 `targetCardTypes` / `targetPlayKind` 做卡牌类型过滤；是否生效只由 improvement action 与当前 candidate 的 wood cost 决定。
- optional 和多选择 cost 修改自然表达为“原候选保留 + `derive()` 返回多条候选”。
- 现有 `costs` delta 的 clamp 语义保留，兼容旧卡的“免成本”写法；旧卡里混用 `costs` / `bonuses` / `trades` 表达候选追加或阻断的实现需要后续单独整改。
- 第一批改动只建立机制、迁移 D117、自动创建旧卡审计 GitHub issue，避免一次 PR 混入大量旧卡行为变化。旧卡审计已跟踪在 #258 `Audit legacy computeCosts cost-candidate cards after D117 deriver migration`，label 为 `ready-for-agent`。
- 完全相同的 duplicate candidate 会合并 provenance，避免重复 UI/payment choices。
- 派生候选来源会进入 payment option 的 `sourceCards`，玩家能看到 D117 等卡参与了该支付选项。
- 派生候选来源也会进入支付日志，便于玩家回看支付为什么使用了某张卡效果。
- 卡牌 deriver 实现只写 cost 变化，来源追加由框架统一处理，降低遗漏 provenance 的风险。

负面 / 风险：
- 非交换 deriver 组合可能生成比 BGA 更多的候选；需要测试守住无负 cost、无无限递归、无重复 duplicate UI 污染，并确认 `keepOnlyOptimals` 在展示层仍按预期压缩 dominated payment options。
- 需要清晰区分 Cost Candidate Deriver 与现有 `TradeModifier` / `BonusModifier`，否则容易重新混淆 BGA `trades` 与 OA `Trade`。
- Provenance 与 UI 去重需要额外小心：内部不能丢来源，展示层不能重复展示等价支付。
- 需要保留 solution-level 来源字段承接 candidate provenance，避免把 deriver 来源误塞进 `bonusUsed`。
- 日志层当前复用 `bonusSources` 可见通道展示卡牌来源；若未来要把事件字段语义拆得更细，需要迁移 mapper、guards 和客户端显示。
- 需要防止卡牌把 candidate provenance 当成规则条件，否则 provenance 会变成隐藏规则输入。
- 需要在机制入口校验 deriver id 唯一性，否则 DFS 的 branch-local `applied` set 会错误跳过不同效果。
- 需要在机制入口校验 deriver `sourceCardId` 非空，并在 card-level listener 场景校验它匹配 `ownerCardId`，避免来源被框架猜错或标错。
- 需要在 D117 机制 PR 里自动创建单独 GitHub issue 审计并迁移旧卡，issue body 必须包含当前扫描清单：保留真正的强制 delta，迁移 candidate-transform，移除 D13 这类阻断 hack。

## Alternatives considered

- **复制 BGA topo ordering**：拒。能更贴近 BGA 单一路径，但会把顺序声明扩散到多张卡和全局机制，增加新卡维护负担。
- **继续用 OA `Trade` 表达 D117**：拒。会把费用候选派生误建模成资源兑换，无法覆盖 replacement 后继续派生的场景。
- **只为 D117 写主路径特例**：拒。违反卡牌局部闭环，也不能服务其它同类 candidate 派生卡。
- **在 candidate 阶段做 domination / Pareto 剔除**：拒。BGA 的候选/combination 生成阶段保留候选，展示前才优化。OA 也应把优化留在 payment solution 阶段，避免破坏候选派生语义和 provenance。
