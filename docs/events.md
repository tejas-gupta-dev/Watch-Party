# Event contract

Names and payload types live in [`shared/src/events.ts`](../shared/src/events.ts) and are imported by both client and server, so a rename or payload change is a compile error on the other side. Permissions live in [`shared/src/roles.ts`](../shared/src/roles.ts).

All events are validated with zod on the server (`server/src/modules/realtime/schemas.ts`). Every handler checks permissions (`assertCan`) **before** it mutates room state. Errors come back to the sender as `room:notice` `{ level: 'error' }` (and through the ack, if the event has one).

## Roles

| Action | Host | Moderator | Participant |
|---|:-:|:-:|:-:|
| play / pause / seek / change video | yes | yes | request only |
| approve or decline requests | yes | yes | no |
| remove a participant | anyone but self | participants only | no |
| assign roles (moderator / participant) | yes | no | no |
| transfer host | yes | no | no |
| chat + reactions | yes | yes | yes |

## Client → server

| Event | Payload | Who may send | Notes |
|---|---|---|---|
| `room:join` | `{ code }` + ack `Ack<RoomSnapshot>` | any signed-in user | Also used after every reconnect: the ack is the fresh state snapshot |
| `room:leave` | – | member | |
| `playback:play` | `{ position }` | host, moderator | position in seconds |
| `playback:pause` | `{ position }` | host, moderator | |
| `playback:seek` | `{ position }` | host, moderator | keeps play/pause state |
| `playback:change_video` | `{ source }` | host, moderator | `Source` = youtube \| file \| local; resets to 0, paused |
| `roles:assign` | `{ targetId, role }` | host | role: `moderator` or `participant` |
| `roles:remove` | `{ targetId }` | host, moderator | mods can only remove plain participants |
| `roles:transfer_host` | `{ targetId }` | host | old host becomes moderator |
| `approval:request` | `{ action: PlaybackAction }` | participant | one pending request per user (new replaces old) |
| `approval:approve` | `{ requestId }` | host, moderator | applies the action and broadcasts it |
| `approval:reject` | `{ requestId }` | host, moderator | requester gets a notice |
| `chat:message` | `{ text }` (1-500 chars) | any member | last 100 kept in Redis |
| `chat:reaction` | `{ emoji }` from `REACTIONS` | any member | not persisted |
| `clock:ping` | ack `(serverTime)` | any | used for clock-offset estimation |
| `metrics:drift` | `{ driftMs }` | any | feeds the `wp_client_drift_ms` histogram |

## Server → client

| Event | Payload | Sent to |
|---|---|---|
| `playback:state` | `PlaybackState` | whole room |
| `room:participants` | `ParticipantDTO[]` | whole room |
| `approval:queue` | `ApprovalRequest[]` | host + moderators only |
| `chat:message` | `ChatMessage` | whole room |
| `chat:reaction` | `ReactionEvent` | whole room |
| `room:notice` | `{ level, message }` | one member |
| `room:kicked` | – | removed member (or an older tab of the same account) |
| `server:draining` | – | everyone, on SIGTERM; clients reconnect to a healthy node |

## Playback state and sync

```
PlaybackState { source, playing, position, updatedAt, version }
```

`position` is the video time **at server time `updatedAt`**. While playing, the true position is `position + (serverNow - updatedAt)`, so the server sends one message per change instead of a stream of ticks (`currentPosition()` in `shared/src/sync.ts`). Clients:

1. estimate `serverClock − localClock` with 8 `clock:ping` round trips, keeping the lowest-RTT sample (`clockSync.ts`);
2. **hard sync** on every state change (seek + play/pause);
3. **soft sync** once a second: drift under ~0.12 s is ignored, up to ~1 s is corrected by nudging `playbackRate` (±8%), more than that by seeking (`driftCorrection.ts`). YouTube has no fine-grained rate, so it seeks above 0.8 s;
4. ignore updates whose `version` is older than what they hold.
