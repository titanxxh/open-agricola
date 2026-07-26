# 10. Completed replays are public shared records with erasure tombstones

- Status: Accepted
- Date: 2026-07-26

## Context

ADR-0009 让一个 `roomId` 永久对应一局游戏，但正常完赛目前只保留标量 Game Result Archive 并删除完整状态。永久公开、可切换座位与全开视角的回放会长期保存手牌、选择和自定义卡内容，因此必须先固定身份展示、账号删除、内容下架、外部 GitHub Issue 和备份恢复的边界。

## Decision

1. 正常完赛产生彼此分离的 Game Result Archive 与 Game Replay Archive。Replay 以原 `roomId` 永久公开，并提供任一座位视角和全开视角；Replay Step 只对应服务端已接受的 ClientCommand 或显式选择，不暴露内部 action leaf。
2. 公开 Replay Participant 只显示该局记录的显示名和 `playerIndex`，站点 `userId` 仅作为内部关联。普通账号删除不能删除整桌共享记录：Replay 和 Result 保留，但该座位改为“已删除玩家（座位 N）”，清除内部用户关联和原显示名。
3. 座位视角按该玩家当时可见信息回放；全开视角公开每一步的手牌、draft、父母选择和已提交答案。归档不保存原始 Private Event 或 private prompt payload、临时通知和传输 envelope。
4. 正式多人局使用未发布自定义卡前，必须明确提示其 Replay Card Snapshot 会永久公开并取得确认；不同意时该卡只能用于 Workshop Sandbox。Snapshot 只包含当局可见的名称、说明、美术和规则参数，不包含 LLM prompt、编辑历史、Generation Provenance、能力源码或编译产物。
5. Game Bug Reporter 必须是已登录、已入座用户并填写一句现象。Issue 正文公开固定的站点 `userId`、`playerIndex`、`roomId`、版本和 Replay Step，但不写邮箱或可变显示名；GitHub 作者由玩家本人凭据或站点托管凭据决定。

删除矩阵如下：

| 触发 | Game Replay Archive | Game Result Archive | GitHub Issue |
|---|---|---|---|
| 用户删号或管理员删号 | 保留规则与回放数据；匿名化该 Replay Participant 并清除内部 `userId` 关联 | 保留座位和分数；清除 `userId` 与显示名 | 保留现象、`playerIndex` 和 `roomId`；正文 `userId` 改为“已删除报告者” |
| 普通 Workshop Card 删除 | 保留已确认公开的 Replay Card Snapshot | 不变 | 不变 |
| 管理员下架或违规内容移除 | 若命中回放 payload，删除整份 payload 并保留 Replay Tombstone，不逐步局部打码 | 保留匿名标量结果 | 仓库所有者按需要编辑，违规或法律要求时永久删除 |
| 法律删除请求 | 只涉及身份时按删号匿名化；涉及回放内容或整份记录时删除 payload 并保留 Replay Tombstone | 默认保留匿名标量结果；明确要求整份记录删除时只保留 Tombstone | 先移除站点身份字段；明确要求时由仓库所有者永久删除 |

Replay Tombstone 只公开原 `roomId` 和粗粒度下架原因，不保留玩家身份或被移除内容，且 `roomId` 永不复用。线上删除请求成功返回时，公开端点必须已停止提供目标数据；备份中的副本最多保留 30 天，任何旧备份恢复上线前必须重放删除清单。

GitHub 个人账号提交产生的 GitHub 作者身份由 GitHub 管理，本站无法随站点删号匿名化，因此首次连接和提交确认必须明确提示。站点仍负责删除 Issue 正文中的站点 `userId`；目标 Issues 仓库所有者负责需要永久删除的 Issue。

## Consequences

- 本 ADR 不改变 ADR-0009 的单局 `roomId` 和 Game Result Archive 边界，但以独立 Game Replay Archive 取代“正常完赛后隐藏状态不长期留库”作为最终产品语义。
- Replay 的用户关联和公开身份必须与规则 payload 分离，使普通删号只需匿名化参与者元数据。
- 自定义卡违规或法律删除采用整局 Tombstone，避免相同内容散落多个步骤时漏删，也避免局部打码生成不可播放的记录。
- 删除清单必须独立于可恢复备份生效，防止恢复旧数据库后重新公开已删除数据。

## Alternatives considered

- **允许删号者删除整局 Replay**：拒绝。多人回放是整桌共享记录，单个参与者不能销毁其他玩家的永久链接。
- **在每个 Replay Step 局部打码违规内容**：拒绝。难以证明所有副本都被移除，也可能破坏回放一致性。
- **永久保存原始 Private Event、prompt payload 和自定义卡源码**：拒绝。Replay 只需要规则相关状态、已接受选择和可见卡面。
- **删除后让 `roomId` 返回 404 或重新使用**：拒绝。Tombstone 才能保持永久标识并明确说明记录已下架。
