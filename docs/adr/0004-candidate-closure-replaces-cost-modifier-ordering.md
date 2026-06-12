# 4. Candidate closure replaces cost modifier ordering

- Status: Accepted
- Date: 2026-06-10
- Supersedes: ADR 0003 第 4 条（candidate pipeline 局部 `CardListenerRegistration.order` 逃生口）

## Context

BGA 通过 `orderComputeCosts*()` 手写卡牌偏序 + Kahn topo 排序（`PlayerCards::applyEffects()`）决定 cost 修改卡牌的执行顺序，并用 `replacesCostFor` 自动把替换型卡排到最前。顺序之所以影响结果：每个卡牌效果是"对当前候选集的每行派生新行"的转换，后执行的卡看得到先执行卡的派生产物（例：D15 替换 clay 行后，B145 的 wood↔reed 替换才有 wood 可换；顺序反了会漏掉合法支付组合）。

OA 不愿引入 topo（ADR 0003 已拒），但落地过程中出现了两处数字 order 的变体：

1. `preview-cost.ts` 的 `orderCardCostListeners`：card-purchase candidate pipeline 按 `CardListenerRegistration.order` 降序串行 fold，fixed-price 卡（A27 / E27 / C95 / E109）靠 `order: 100` 保证先跑，同 order 按卡牌 id 字典序——伪确定性，对管线前缀敏感（D117 这类"遍历候选派生新候选"的卡随卡池变化可能静默改变结果）。
2. `enumerate.ts` 的 `buildUnitCostOptions`：unit trade 按 `TradeModifier.order` 升序链式应用（D15 `order:10`、B145 `order:20`、A123 `order:30`）。

数字 order 就是手写偏序换了形式：新卡作者必须知道全局 order 约定，维护负担与 BGA topo 相同。

关键观察：**BGA 的顺序只防漏候选，不禁组合**——某个固定序的产物总是"所有应用序产物并集"的子集，多余序的产物要么重复要么是玩家不会选的中间态。这使无序化成为可能。

## Decision

用**候选闭包（Candidate Closure）+ 强制饱和（Mandatory Saturation）**替代一切 cost 修改器顺序机制：

1. **闭包**：成本候选集对卡牌成本转换集合求不动点——反复将每个未达使用上限（`maxUses`，默认 1）的转换应用到每个候选，新候选去重后并入，直到收敛。结果 = 所有应用顺序产物的并集，与注册顺序无关（排列不变）。
2. **强制饱和过滤**：每个转换声明局部语义 `mandatory`（强制，BGA"costs N less"）或 optional（玩家可选，BGA"can pay X instead"）。闭包结果集只保留"饱和候选"——不存在仍可应用的 mandatory 转换；未饱和候选仅作为中间节点继续派生。这保证 mandatory 链任意序收敛到与 BGA 相同的终态集，超集只来自 optional 分支（真正的玩家选择权，BGA 同样全保留）。
3. **fixed-price 卡不需要特殊声明**：A27 / E27 / C95 / E109 这类固定价是"不依赖输入的 optional 转换"，闭包对每个候选产出同一 fixed 行、去重后唯一，折扣自然作用其上。`order: 100` 与任何 `kind` 字段都不需要。
4. **删除全部 order 字段**：`CardListenerRegistration.order`、`TradeModifier.order`，以及 `engine-utils.ts` trailing-listener 排序中的 `order` 兜底（删除后成死代码）。
5. **双轨保持**（尊重 ADR 0003）：card-purchase candidate pipeline 与 action `computeCosts` 聚合仍是两条路径；闭包核作为共享内部实现分别接入 `resolveCardCostWithModifiersDetailed`（替代串行 fold）与 `buildUnitCostOptions`（替代 order 排序链），不把 candidate pipeline 推广到其他 action path。
6. **确定性**：闭包遍历按固定的 source id 排序做 tie-break（仅保证可重现与 attribution 稳定，不是卡牌语义偏序，卡牌作者不感知）。
7. **parity 验收标准**：BGA combinations 集合 ⊆ OA 候选集合；纯 mandatory 场景集合严格相等；对修改器注册顺序做排列洗牌，输出集合不变。

## Consequences

正面：

- 新卡作者只写局部语义（替换什么、折扣什么、mandatory 与否、上限几次），不写任何与其他卡的关系；不存在"加一张卡静默改变既有组合结果"的远程耦合。
- D15+B145+A123、A143+C122、A27+A143、D117 派生于派生等顺序敏感组合在闭包下自动获得全部合法支付方案。
- 复杂度有界：候选数 ≤ |基础候选| × ∏(每卡 maxUses+1)，实战同场 cost 卡 ≤4 张，配合去重与 `maxUses` 上限可控。

负面 / 风险：

- optional 分支的候选集是 BGA 单一 topo 序产物的合法超集，玩家可选项可能比 BGA 多（登记为 accepted divergence）。
- 闭包最坏情况指数级；需保留防御性上限告警（实战远达不到）。
- mandatory / optional 映射必须逐卡对照 BGA 卡面语义，映射错误会改变 auto-resolve / 弹选择框判定。

## Amendment: representative row dedupe (2026-06-11)

闭包可经多条派生链到达 resources + originalFeeIndex 相同、仅 sources 不同的等价行（fixed-price 双子 C95/E109，或 optional 先消耗 mandatory 资源的 bypass 链）。这些行对玩家是同一个支付选择，全部展示是噪音且归因成倍（实测 Basket 四卡场景出现 4 个等价的 1-reed 选项）。

修订 ADR 0003 第 7 条：闭包 visited 仍用含 sources 的 key（保证遍历完整），但**输出层每个 resources + originalFeeIndex 组只保留一条确定性代表行**——sources 数最少优先（最贴近 BGA reference 归因），再按规范化 candidate key 字典序。原"删真超集行"规则是其特例，被此规则吸收。

代价（接受）：未被选中链的卡牌不出现在该选项的 sources / hover 归因中（如 C95 与 E109 同场时固定价只归因 C95）。sources 并集方案被否决——C95/E109 是"二选一"促成关系，并集展示会误导为"共同作用"，且与 bypass 链的最小归因语义冲突。

## Amendment: dominance pruning restored (2026-06-11)

定位 C95"不应出现 2 reed 选项"时确认：BGA 的 optional-append cost 模式依赖 Pay 层 `keepOnlyOptimals`（严格支配剪枝）才成立——append 保留的原价行与其折扣派生在 BGA 中被剪枝隐藏，玩家只见 optimal 集。OA 在 b2b00d96（清理 `preservedOriginalFor` 时）把剪枝清成 no-op stub，使原价行及其派生漏到 UI（optional 折扣事实上展示了玩家永远不该选的行）。

恢复 solver 层 `keepOnlyOptimals` 真实实现：付出 ≥ 另一解的每项资源且至少一项严格更多的解被剪除。三个永久豁免对应 BGA `isWorseThan` 豁免集：

- **支付路径身份**（`ComplexCost.feeIdentities` → `PaymentSolution.feeIdentity`，来自候选 `originalFeeIndex`）：不同身份的解不互剪——身份驱动后续效果（B65 future grain 数量），玩家有权选更贵的路径换不同收益。
- **bonusChoiceIndex**（E123）：选择索引被 after-pay 消费，不互剪。
- **card 支付**：与资源支付不可比。

约束：剪枝必须在**玩家资源可行性过滤之后**执行（solver 内），不能在候选层做——资源盲剪会删掉穷玩家唯一付得起的次优行。

行为面变化（对齐 BGA）：大量"原价 + 折扣并存弹选择框"的交互收敛为单选项 auto-resolve；ADR 0003 §7 的"不做 domination / Pareto 剪枝"被本节推翻。parity fixture 比较层面同步：BGA 侧结构展开选项也应用同等剪枝（choices 展开行豁免）。

### Amendment: payment-side trade side effects removed (2026-06-12)

OA 曾把 B155 这类"用行动格资源支付成本"表达为 `Trade.sideEffect`，并在 dominance 中对带 side effect 的 trade 支付做保守豁免。这会把单卡支付语义混入通用 trade 执行路径。

决策：payment solver 内删除 `trade.sideEffect` 支付执行机制。卡牌若要提供类似 `B155_ArtTeacher:traveling-players-food` 的虚拟支付资源，应在卡牌内部实现 provider；provider 动态声明可用量、能覆盖哪些成本资源、以及执行支付时如何消耗来源状态。`PaymentSolution.resourcesPaid` 保留虚拟资源自身的稳定 key，因此 dominance 只需按支付资源 key 比较：玩家库存 food 与 Traveling Players food 是不同支付资源，不互相支配。

边界：虚拟支付资源不进入 `PlayerState.resources`，也不出现在成本候选行；成本需求仍写普通资源，支付方案记录实际消耗的虚拟资源 key。payment pipeline 只识别统一 provider 接口，不在核心路径写 B155 特例。`Trade.sideEffect` 继续仅用于 exchange action 这类资源兑换执行路径。

## Alternatives considered

- **BGA topo 排序**：拒（ADR 0003 已拒，维护负担）。
- **保留数字 order + lint 约束**：拒。维护负担与伪确定性不变。
- **自动推导依赖边再 topo**：拒。仍是顺序模型，循环依赖需报错，表达力不超过闭包。
- **mandatory 单独预处理阶段 + optional 闭包**：拒。两类语义分支引擎复杂度更高，且 mandatory 转换与 optional 转换交错派生的场景（折扣作用于可选替换产物）仍需闭包，饱和过滤统一表达更简。
- **保留中间态 + domination 剪枝**：拒。ADR 0003 已决定候选层不做 Pareto / domination 剪枝，重新引入会破坏该边界且剪枝规则难以无序化表达。
