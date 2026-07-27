# 9. Room ID identifies one game

- Status: Accepted
- Date: 2026-07-24

## Context

`newGame` 曾在原 Room 内替换 `GameSession`，导致一个 `roomId` 对应多局游戏。旧持久化接口又用 `markFinished` 同时处理正常完赛、TTL、解散和删号，无法可靠区分可统计结果与未完成清理。

## Decision

1. 一个 `roomId` 永久对应一局游戏和至多一份结果。新房间和 `newGame` 使用 `crypto.randomUUID()`，并排除活动记录、进程内封存 id 和结果归档中的已有 id。
2. `newGame` 可迁移人数、在线座位、custom cards、轮抽设置与已持久化变体开关，但在新局第一次 Durable Room Commit 前，Room、Registry、连接和客户端 URL 都切换到新 id。旧局已完成则归档不变，未完成则直接丢弃。
3. 首次 `waiting → playing` 时记录不可变 `started_at`。
4. 持久化生命周期拆为 `complete(result)` 与 `discard(id)`。只有权威 `gameOver` 可完成；TTL、解散、账号删除和未完成重开只能丢弃。
5. `game_results` 与 `game_result_players` 只保存标量字段，玩家用户身份按持久化 `room_players.player_index` 对齐。ADR-0011 与 ADR-0014 后续把最终 Replay Frame 和 Replay completed 状态加入同一完成事务；事务成功才删除活动房间及 `state_json`，失败则整体回滚并保留最终全量状态。
6. v19 迁移删除既有 `status='finished'` 房间，不从无法证明正常完赛的旧行补造结果；v20 将四个结果变体列统一为 `enable_*` 命名。
7. 代表性真实命令与 Replay 写入探针把 2 vCPU / 2 GiB 单实例上限设为 30 个普通内存 Room；提高上限必须使用同一探针复测。

## Consequences

- `roomId` 可直接作为游戏结果 id，不再需要额外 match id。
- 完赛后的 `rooms.state_json` 仍删除；ADR-0010 与 ADR-0011 另行允许权威隐藏状态只存在于永久 Game Replay Archive，Game Result Archive 继续保持标量。未完成清理不会污染统计。
- JSON adapter 仍只删除状态文件，不提供结果统计。
- 已断线玩家可以通过此前持久化的座位身份进入结果摘要。
- 当前部署按 ADR-0014 限制为 30 个普通内存 Room。

## Alternatives considered

- **继续复用 roomId，另加 gameId**：拒绝。协议、持久化和客户端需要同时维护两套标识。
- **继续用 finished 状态统一终结**：拒绝。无法证明一行是正常完赛还是清理路径。
- **从历史 finished 行补归档**：拒绝。旧数据没有可信的完成原因。
