import { describe, expect, it } from 'vitest';
import { Role } from '@watch-party/shared';
import { Room } from '../../src/modules/rooms/Room';

const fakeIo = { to: () => ({ emit: () => undefined }) } as never;
const user = (id: string) => ({ id, username: id, guest: true });

describe('Room', () => {
  it('creator becomes host, others participants, roles survive rejoin', () => {
    const room = new Room('ABC123', 'Test', 'h', fakeIo);
    expect(room.join(user('h'), 's1').role).toBe(Role.Host);
    expect(room.join(user('a'), 's2').role).toBe(Role.Participant);
    room.setRole('a', Role.Moderator);
    room.leave('a');
    expect(room.join(user('a'), 's3').role).toBe(Role.Moderator);
  });

  it('play/seek/pause update the anchor and bump the version', () => {
    const room = new Room('ABC123', 'Test', 'h', fakeIo);
    room.applyAction({ type: 'change_video', source: { type: 'youtube', videoId: 'dQw4w9WgXcQ' } });
    const v = room.playback.version;
    room.applyAction({ type: 'play', position: 5 }, 1000);
    expect(room.playback).toMatchObject({ playing: true, position: 5, updatedAt: 1000 });
    room.applyAction({ type: 'seek', position: 60 }, 2000);
    expect(room.playback).toMatchObject({ playing: true, position: 60 });
    room.applyAction({ type: 'pause', position: 61 }, 3000);
    expect(room.playback.playing).toBe(false);
    expect(room.playback.version).toBe(v + 3);
  });

  it('transferHost swaps roles', () => {
    const room = new Room('ABC123', 'Test', 'h', fakeIo);
    room.join(user('h'), 's1');
    room.join(user('a'), 's2');
    room.transferHost('a');
    expect(room.roleOf('a')).toBe(Role.Host);
    expect(room.roleOf('h')).toBe(Role.Moderator);
    expect(room.hostId).toBe('a');
  });

  it('keeps one pending approval per user', () => {
    const room = new Room('ABC123', 'Test', 'h', fakeIo);
    room.addApproval({ id: 'a', username: 'a' }, { type: 'play', position: 1 });
    room.addApproval({ id: 'a', username: 'a' }, { type: 'pause', position: 2 });
    expect(room.approvalList()).toHaveLength(1);
    expect(room.approvalList()[0].action.type).toBe('pause');
  });
});
