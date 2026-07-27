# 11. Replay archives use bounded authoritative state deltas

- Status: Accepted
- Date: 2026-07-26

## Context

Game Replay Archive 必须永久精确播放正常完赛的对局，同时支持进行局追加、Room 恢复、稳定的 Bug Report Anchor、座位视角与全开视角。代表性 176 步对局若为每步独立完整权威 JSON 并逐行 gzip，需要 2.63 MiB；命令重放则会依赖历史规则代码，而且现有持久化状态不包含可忠实重放 undo 的历史。

## Decision

1. Replay Frame 是播放和取证的唯一真相。Step 0 在权威初始状态能够接收第一个互动命令前保存；classic deal 已在 Step 0 内，互动 draft、Parent Selection 和其他多人提交从 Step 1 起记录。之后只有成功且改变权威状态的 ClientCommand 或 choice 生成 Replay Step。失败命令、重连、补拉状态和心跳不记录，成功 undo 作为新 Step 记录。`stepNo` 按 Room 全局串行递增，不依赖 `roomVersion`；多个玩家同时提交时占用连续 Step，最后一份输入触发的自动结算属于该 Step，结算结果不得依赖到达顺序。
2. Replay Frame 直接复用当局版本未过滤的 `SerializedGameState`，包含 engine cursor、events 和 log，不包含 GameSyncPayload 的 Private Event、private prompt、传输 envelope、运行时函数或 undo 快照。命令只作为 Replay Step Metadata，不参与状态重算。
3. 每局只有一个 Replay header 和一组按 Step 存储的行，不创建独立 Segment 表。Step 行由 `payloadKind` 区分完整 checkpoint 与 Replay State Delta，`roomId + stepNo` 唯一；逻辑 Replay Segment 从 checkpoint 开始，到下一 checkpoint 前结束。
4. Step 0 建立完整 checkpoint，正常情况下其后每 16 步建立新 checkpoint，因此任意目标最多应用 15 个 delta。若某一步未压缩 delta JSON 已不小于完整 Frame JSON，则提前保存完整 checkpoint 并开始新 Segment。每个 checkpoint 和 delta 独立 gzip。
5. Replay State Delta 使用 RFC 6902 JSON Patch 的 `add`、`remove`、`replace` 子集。对象键按字典序处理；数组按索引比较，尾部从高到低删除并按顺序追加，不做 LCS 或其他复杂最小差异计算，也不引入 JSON diff 依赖。
6. 每行保存重建后完整 Replay Frame 的 SHA-256。Hash 输入是对象键递归排序、数组顺序不变的 UTF-8 JSON，而不是 gzip 或 delta 字节；它用于检测损坏和错序，不是防篡改签名。
7. Replay Step Metadata 只保存 `stepNo`、`roomVersion`、操作者 `playerIndex`、命令类型、白名单化游戏参数和 Frame Hash。它明确排除 token、`requestId`、站点 `userId`、原始 WebSocket 消息和任意未校验 payload。
8. Replay header 分别保存 `schemaVersion`、内容寻址的 `viewerBuildId` 和用于诊断的 `gameBuildId`，三者在 Room 创建时锁定。部署新版本后，最新版后端继续按存量 Room 的原 schema 写入直至该局结束；新 Room 使用新 schema。正式上线后的历史 payload 不迁移、不批量重写，也不执行历史后端或规则代码。
9. 每个 Replay Viewer Build 是永久保留的不可变只读前端构建，在无登录凭据的沙箱中解释对应 schema。缺失或损坏时明确报告不可用，不用最新版 Viewer 强行读取。正式上线前的试验版本和数据可以删除；上线后，只要仍有 Replay 引用，对应 Viewer Build 就不得删除。
10. 每局只保存一条包含全部隐藏规则状态的权威链，不按玩家复制。进行局恢复由最新版后端按已认证座位过滤；正常完赛后，历史 Replay Viewer 可按任一座位视角隐藏信息，也可全开显示。
11. 活动 Room 的现有完整快照仍是恢复源，不从 Replay delta 链恢复活动会话。每个成功 Step 必须在向玩家广播前，用同一 SQLite 事务更新 Room 快照并追加 Replay 行；失败时暂停该 Room 并重试，不能继续生成后续 Step。
12. 重试写入相同 `roomId + stepNo + frameHash` 视为幂等成功；相同 Step 出现不同 hash 是一致性错误，必须暂停 Room。`gameOver` 用一个事务写最终 Frame、写 Game Result Archive、标记 Replay completed 并删除活动 Room；失败则全部回滚，保留 Room 与 recording 链重试，不复制或重压整条 Replay。
13. Bug Report Anchor 固定为 `roomId + stepNo + frameHash`。进行局锚定点击时最新已持久化 Step，结束局锚定当前播放 Step，初始阶段使用 Step 0。
14. delta 应用失败或 Frame Hash 不匹配时不得静默修复或覆盖原始数据。目标 Replay Segment 标记为损坏并显示不可用区间；播放可从下一完整 checkpoint 恢复。

## Consequences

- Replay 不执行旧命令、旧规则或自定义卡源码；规则和 schema 演进不会改变已归档 Frame 的含义。
- 有界 Segment 支持最多 15 次 patch 的随机定位，并把 delta 损坏限制在一个 Segment。
- Room 快照与 Replay Step 的同步事务取代当前一秒 debounce，保证已广播步骤不会在崩溃后丢失；ADR-0014 根据代表性复测把 2 CPU / 2 GiB 单实例上限设为 30 个普通内存 Room，实施后仍须复验相同门槛。
- 永久 Replay 同时要求永久保留其 Replay Viewer Build；旧前端只承担无凭据、只读展示职责。
- 未完成或已解散 recording 在 Bug Report 后的保留与访问策略，由“确定永久 Game Context Link 与访问契约”继续决定。

## Alternatives considered

- **每步独立保存完整 gzip Frame**：拒绝。实现最简单但代表性对局为 2.63 MiB，永久容量随对局数线性放大。
- **初始状态加命令日志并用规则代码重放**：拒绝。规则与自定义卡实现会演进，现有存档也不包含忠实重放 undo 所需历史。
- **无限 delta 链**：拒绝。随机定位成本、单点损坏范围和长期恢复风险都会随对局长度增长。
- **按玩家视角保存多条链**：拒绝。重复存储同一规则状态，而且容易让不同视角在 Step 边界上漂移。
- **部署时重写历史 payload 或由最新版 Viewer 迁移旧 schema**：拒绝。批量重写会改变原始取证数据并增加回滚风险；已上线 Replay 改由固定的历史 Replay Viewer Build 读取。
