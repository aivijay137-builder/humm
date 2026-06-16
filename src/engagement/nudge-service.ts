import { randomUUID } from 'node:crypto';
import type { MemberId, Notification } from '../domain/types';

export interface NudgeContext {
  readonly member_id: MemberId;
  readonly current_week: number;
  readonly last_checkin_week: number | null;
  readonly milestone_reached: boolean;
}

export function generateNudges(ctx: NudgeContext): Notification[] {
  const nudges: Notification[] = [];
  const now = new Date();

  nudges.push({
    id: randomUUID(), recipient_id: ctx.member_id, recipient_type: 'member',
    type: 'check_in_due', ts: now, read_at: null,
  });

  const lapsed =
    ctx.last_checkin_week === null
      ? ctx.current_week > 1
      : ctx.current_week > ctx.last_checkin_week + 1;

  if (lapsed) {
    nudges.push({
      id: randomUUID(), recipient_id: ctx.member_id, recipient_type: 'member',
      type: 'lapse_nudge', ts: now, read_at: null,
    });
  }

  if (ctx.milestone_reached) {
    nudges.push({
      id: randomUUID(), recipient_id: ctx.member_id, recipient_type: 'member',
      type: 'milestone', ts: now, read_at: null,
    });
  }

  return nudges;
}
