import { describe, expect, it } from 'vitest';
import { Role, canPerform, canRemove, currentPosition, parseYouTubeId } from '@watch-party/shared';

describe('permission matrix', () => {
  it('host and moderators control playback, participants only chat', () => {
    for (const a of ['play', 'pause', 'seek', 'change_video'] as const) {
      expect(canPerform(Role.Host, a)).toBe(true);
      expect(canPerform(Role.Moderator, a)).toBe(true);
      expect(canPerform(Role.Participant, a)).toBe(false);
    }
    expect(canPerform(Role.Participant, 'chat')).toBe(true);
  });
  it('only the host assigns roles and transfers host', () => {
    expect(canPerform(Role.Host, 'assign_role')).toBe(true);
    expect(canPerform(Role.Moderator, 'assign_role')).toBe(false);
    expect(canPerform(Role.Moderator, 'transfer_host')).toBe(false);
  });
  it('removal rules', () => {
    expect(canRemove(Role.Host, Role.Moderator)).toBe(true);
    expect(canRemove(Role.Host, Role.Host)).toBe(false);
    expect(canRemove(Role.Moderator, Role.Participant)).toBe(true);
    expect(canRemove(Role.Moderator, Role.Moderator)).toBe(false);
    expect(canRemove(Role.Participant, Role.Participant)).toBe(false);
  });
});

describe('sync math', () => {
  it('paused: position does not move', () => {
    expect(currentPosition({ playing: false, position: 42, updatedAt: 1000 }, 9000)).toBe(42);
  });
  it('playing: advances with server time', () => {
    expect(currentPosition({ playing: true, position: 10, updatedAt: 1000 }, 3500)).toBeCloseTo(12.5);
  });
  it('never negative', () => {
    expect(currentPosition({ playing: true, position: 0, updatedAt: 5000 }, 1000)).toBe(0);
  });
});

describe('parseYouTubeId', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    [`https://www.youtube.com/watch?v=${id}&t=10`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`https://youtube.com/shorts/${id}`, id],
    [`https://www.youtube.com/embed/${id}`, id],
    [id, id],
    ['https://example.com/watch?v=' + id, null],
    ['not a url', null],
  ])('%s', (input, expected) => expect(parseYouTubeId(input)).toBe(expected));
});
