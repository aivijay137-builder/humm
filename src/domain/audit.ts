import { randomUUID } from 'node:crypto';

export type AuditAction =
  | 'care_plan.created'
  | 'care_plan.transitioned'
  | 'care_plan.approved'
  | 'care_plan.published'
  | 'health_data.accessed'
  | 'consent.granted'
  | 'escalation.created'
  | 'escalation.acknowledged';

export interface AuditEntry {
  readonly id: string;
  readonly ts: Date;
  readonly actor_id: string;
  readonly action: AuditAction;
  readonly subject_id: string;
  readonly subject_type: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AuditLog {
  append(entry: Omit<AuditEntry, 'id' | 'ts'>): AuditEntry;
  entries(): AuditEntry[];
}

export function createInMemoryAuditLog(): AuditLog {
  const store: AuditEntry[] = [];

  return {
    append(entry) {
      const full: AuditEntry = {
        ...entry,
        id: randomUUID(),
        ts: new Date(),
      };
      store.push(full);
      return full;
    },
    entries() {
      return [...store];
    },
  };
}
