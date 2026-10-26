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
