import type { ParticipantDTO, Role } from '@watch-party/shared';

export class Participant {
  constructor(
    public readonly id: string,
    public username: string,
    public role: Role,
    /** current socket id, null while disconnected (grace period before removal) */
    public socketId: string | null,
  ) {}

  get online(): boolean {
    return this.socketId !== null;
  }

  toDTO(): ParticipantDTO {
    return { id: this.id, username: this.username, role: this.role, online: this.online };
  }
}
