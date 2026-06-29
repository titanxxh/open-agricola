# 3. Card-purchase ComputeCardCosts candidate pipeline

- Status: Accepted（第 4 条 order 逃生口已被 ADR 0004 取代；第 7 条去重规则已被 ADR 0004 Amendment 修订）
- Date: 2026-06-06

## Context

OA 当前卡牌购买成本通过 `computeCosts.improvement` listener 聚合 `{ costs, bonuses, trades }`，再交给通用 payment solver。这个模型对简单折扣可用，但和 BGA 的 `onPlayerComputeCardCosts(&$args)` 有关键差异：

1. BGA 以当前 card cost candidates 为输入，让卡牌直接追加、修改或替换候选；OA 当前是先收集 listener 返回值再合并，无法表达 D117 Wood Expert 这类“遍历当前候选并派生新候选”的行为。
2. BGA card-purchase path 会把 B65 Grain Depot 这种“先选基础支付路径，再进入 ComputeCardCosts”的成本也送入同一机制；OA 当前只依赖最终 `feeIndex`，没有让该路径经过卡牌成本变形。
3. BGA 没有 OA 旧的 `preserveOriginal` 字段；append candidate 本身就是保留原候选。OA 已删除 `preserveOriginal` / `preservedOriginalFor` 和相关 Pareto 剪枝，后续不应重新引入同类概念。
4. BGA 对 card-purchase cost 的拓扑排序存在于 `PlayerCards::applyEffects()`，但当前 OA 不希望为此引入开发者多处声明顺序的 topo 机制。

这个问题只存在于购买 major / minor improvement 的卡牌成本路径。Construct、renovation、fence、stables、plow、occupation 等其他 `computeCosts` action path 仍使用现有通用 payment 机制。

## Decision

为卡牌购买引入一个小的 **ComputeCardCosts candidate pipeline**，只接入 major / minor improvement 购买成本：

1. Pipeline 输入是 `Cost Candidate List`：由当前卡牌的基础 `fee` / `fees` 规范化而来。
2. 官方卡牌购买成本 modifier 一次性迁移到专用 candidate mutation API；迁移范围是当前 17 张 `computeCosts.improvement` 官方卡和 `B065_GrainDepot` 的路径成本。
3. `A020_DoubleTurnPlow` / `B036_Bottles` 不作为 cost modifier；它们对齐 BGA `getBaseCosts()`，在进入 pipeline 前产出动态基础候选。
4. Pipeline 不引入 BGA topo。多个 mutation 默认按稳定 listener id 顺序执行；发现 fixed-price 必须先于普通折扣的真实冲突后，pipeline 局部读取 `CardListenerRegistration.order` 作为单点优先级（高值先执行，再按 id 稳定排序），不影响普通 trigger listener 结算。
5. 直改 candidate 的资源减少 clamp 到 0；如果候选本来没有该资源，则不派生对应折扣候选；折到 0 的资源从 candidate 资源 map 中省略。同一张卡不对自己刚追加的候选重复应用。
6. Append / fixed-price 类卡牌追加新候选并保留原候选；replacement 类卡牌只替换被实际改变的候选，未受影响的基础候选保留。
7. 候选只做完全重复去重，不做 domination / Pareto 剪枝。去重 key 包含资源、原始 `feeIndex` 和 `sources`。（已被 ADR 0004 Amendments 两次修订：输出层每个 resources + originalFeeIndex 组只保留一条代表行；solver 层恢复 BGA 式支配剪枝——候选层仍不剪，剪枝发生在资源可行性过滤之后。）
8. Candidate metadata 包含 `sources`、原始 `feeIndex`，以及可选的 Cost Attribution。`feeIndex` 表示基础支付路径身份，不随后续资源变形改变；B65 使用它决定 2/3/4 个 future grain。Cost Attribution 只用于卡牌统计展示，不表示真实资源移动或整笔支付归属。
9. 本 pipeline 不重做 bonus 机制。`D082_HuntingTrophy`、`E130_Overachiever`、`E123_ResourceHoarder` 等 bonus / bonusChoiceIndex 语义继续走现有 solver。
10. UI 展示复用现有 payment option `sourceCards` 链路：后端把 candidate `sources` 合并进 payment option / effect preview 的 `sourceCards`，前端继续由 `InteractionBar` 展示卡名。hover stats 读取 Card Resource Stats；选定候选后才把 Cost Attribution 写入对应 source cards。
11. 非 card-purchase action cost 不进入本 candidate pipeline。A128 Riparian Builder 这类 action `computeCosts` 折扣若需要 hover stats，应在旧 action cost path 上显式声明 Cost Attribution。

## Consequences

正面：
- D117 Wood Expert、B65 Grain Depot、Blueprint / Site Manager / fixed-price cards 可以按 BGA 的 candidate append/mutation 语义表达。
- 卡牌购买路径与其他 action cost path 分离，避免把 candidate mutation 概念扩散到 construct、renovation、fence 等已有稳定路径。
- UI 可以显示 card-purchase candidate 的来源，不需要新前端组件。
- 不引入 topo，避免新卡作者在多个位置声明顺序；当前只为 candidate pipeline 暴露单点 `order` 逃生口。

负面 / 风险：
- 同一套项目里会短期并存两种 cost extension 语义：card-purchase candidate pipeline 与其他 action 的旧 `computeCosts` 聚合。
- listener id 顺序和局部 `order` 仍不是 BGA topo；后续如果出现跨阶段依赖，仍需重新设计更明确的顺序模型。
- Candidate metadata 必须和 solver 的 `feeIndex` 排序保持一致，否则 B65、UI 来源展示和 Cost Attribution 都会错配。

## Alternatives considered

- **引入 BGA topo 排序**：拒。虽然更接近 BGA，但会迫使新卡作者在多处声明顺序，且当前冲突规模不足以证明需要全局 topo。
- **只修 D117 / B65 局部逻辑**：拒。会继续保留无法表达 candidate append 的核心缺口，后续 C27 / D95 / fixed-price cards 仍会重复补丁。
- **把 candidate pipeline 扩展到所有 `computeCosts` action path**：拒。范围过大，会同时影响 construct、renovation、fence、stables、plow、occupation，和本次 card-purchase parity 目标不匹配。
- **把 candidate sources / attribution 写入通用 `PaymentSolution`**：拒。`PaymentSolution` 是所有支付路径共用类型；candidate metadata 仅属于 card-purchase preview/payment glue，应在 improvement payment builder 中合并到现有 `sourceCards`，并在支付选定后写入 Card Resource Stats。
- **重新引入 `preserveOriginal` 或 domination 例外**：拒。BGA append candidate 语义天然保留原候选；OA 已决定不再用 Pareto 剪枝表达这件事。
