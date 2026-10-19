import { buildChain } from '../../app/api/applications/[id]/chain/route';
import type { LocalDbApplication } from '../local-db';

function makeApp(overrides: Partial<LocalDbApplication> & { id: string }): LocalDbApplication {
  return {
    application_number: '',
    object_name: '',
    service_name: '',
    organization: '',
    status: '',
    submission_date: null,
    last_changed_date: null,
    current_action: '',
    acting_party: '',
    verification_password: '',
    sms_phone: '',
    notes: '',
    pdf_filename: '',
    pdf_storage_key: null,
    project_id: null,
    parent_id: null,
    archived: false,
    sync_state: 'idle',
    last_checked_at: null,
    next_check_at: null,
    last_error: '',
    last_detected_change_at: null,
    last_change_summary: [],
    last_change_fields: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('chain buildChain cycle guard', () => {
  jest.setTimeout(5_000);

  it('terminates instead of hanging on a self-referencing parent_id', () => {
    const all = [makeApp({ id: 'a', parent_id: 'a' })];

    const result = buildChain(all, 'a');

    expect(result.map((a) => a.id)).toEqual(['a']);
  });

  it('terminates instead of hanging on a cyclic parent_id chain (a -> b -> c -> a)', () => {
    const all = [
      makeApp({ id: 'a', parent_id: 'c' }),
      makeApp({ id: 'b', parent_id: 'a' }),
      makeApp({ id: 'c', parent_id: 'b' }),
    ];

    const result = buildChain(all, 'a');

    // Every node in the cycle is visited exactly once and the call returns.
    expect(result).toHaveLength(3);
    expect(new Set(result.map((a) => a.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('still returns the correct chain for a normal, acyclic parent/child tree', () => {
    const all = [
      makeApp({ id: 'root', parent_id: null, created_at: '2026-01-01T00:00:00.000Z' }),
      makeApp({ id: 'child1', parent_id: 'root', created_at: '2026-01-02T00:00:00.000Z' }),
      makeApp({ id: 'child2', parent_id: 'root', created_at: '2026-01-03T00:00:00.000Z' }),
    ];

    const result = buildChain(all, 'child1');

    expect(result.map((a) => a.id)).toEqual(['root', 'child1', 'child2']);
  });
});
