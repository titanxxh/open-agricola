# 40. Live spectators receive public state without owning seats

- Status: Accepted
- Date: 2026-11-06

Issue #1587 adds live viewing to public ordinary multiplayer games. A logged-in nonparticipant may spectate after the game starts, including private opening stages, while at least one participant is online. Invitations, solo, hotseat and development games retain their existing access boundaries.

Spectators have no seat and receive only the server's public state projection, public interactions and public history. Choosing another farm never changes visibility. Private hands, opening candidates, private events, card state and unrevealed round cards remain hidden. Spectators cannot issue game commands, submit Bug Reports or participate in ending proposals.

The lobby exposes a viewing action, and the existing permanent Room link restores an owned seat before considering spectating. The `context` alias remains participant-only recovery. Live viewing uses the existing WebSocket snapshot path and never depends on a completed Replay's all-open payload.

Spectator subscriptions are transient and separate from seats, presence, admission reservations, saved state and Replay Steps. Joining, leaving and reconnecting do not clear an offline deadline or hold a Session in memory. When the final participant disconnects, subscriptions stop and browsers retain their last public picture with an offline notice. New viewing requires a participant to return.

Normal completion and agreed termination stop live viewing with an archive entry point. A rematch creates a different Game Context, and spectators remain attached to the original identity. The first version provides real-time updates, farm switching, complete public logs and reconnection. It adds no chat, spectator roster, delayed stream or historical live-state navigation.

This extends ADR 0013's participant-only active access with a separate public viewing authority. Reusing a player seat or a Replay perspective was rejected because either would grant private information or couple live viewing to archival data.
