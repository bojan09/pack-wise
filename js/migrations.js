// Data-schema migrations for backups and stored data. Each step upgrades one version.
import { SCHEMA_VERSION } from './models.js';

const MIGRATIONS = [
  {
    // v0 = pre-release backup format: items carried `qty` + `done` instead of `target` + `packed`.
    from: 0,
    to: 1,
    up(data) {
      const items = (data.items || []).map((i) => {
        if (i && typeof i === 'object' && !('target' in i)) {
          const { qty, done, ...rest } = i;
          const target = Number.isFinite(qty) ? qty : 1;
          return { ...rest, target, packed: done === true ? target : 0 };
        }
        return i;
      });
      return { ...data, items };
    },
  },
  {
    // v1 -> v2: guide entries (saved places / dishes) were added; existing data simply has none yet.
    from: 1,
    to: 2,
    up: (data) => ({ ...data, entries: Array.isArray(data.entries) ? data.entries : [] }),
  },
  {
    // v2 -> v3: entries may be user-written (kind 'custom'). Nothing to rewrite: existing entries keep working.
    from: 2,
    to: 3,
    up: (data) => data,
  },
  {
    // v3 -> v4: entries may be 'web' (saved from the online lookup). Additive: nothing to rewrite.
    from: 3,
    to: 4,
    up: (data) => data,
  },
];

/**
 * Upgrade a data snapshot to the current schema.
 * @returns {{data: object, from: number, to: number, changed: boolean}}
 */
export function migrate(data, fromVersion) {
  let version = Number.isInteger(fromVersion) && fromVersion >= 0 ? fromVersion : 0;
  const from = version;
  let current = data;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) throw new Error(`No migration path from schema v${version}`);
    current = step.up(current);
    version = step.to;
  }
  return { data: current, from, to: version, changed: from !== version };
}
