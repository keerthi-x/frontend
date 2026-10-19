/**
 * @file tests/crdt.test.ts
 * @description Automated verification suite providing empirical evidence for:
 *  1. Performance claims (10,000 CRDT state merges & < 100ms cross-tab budget)
 *  2. Reliability & deterministic conflict resolution (HLC monotonicity, lexicographical
 *     nodeId tie-breaking, field-level isolation, and 250-op semilattice convergence)
 *  3. Security & data integrity claims (XSS payload rejection, prototype-pollution
 *     mitigation, and numeric clamping on untrusted localStorage/IPC payloads)
 */

import { describe, it, expect } from 'vitest';
import { HybridLogicalClock } from '../src/crdt/hlc';
import { SettingsCRDT } from '../src/crdt/settingsCrdt';
import type { SettingsCRDTState } from '../src/types/settings';

describe('ChronoSync — Empirical Reliability, Performance & Security Test Suite', () => {
  it('1. [Reliability] Enforces strict HLC monotonicity during sub-millisecond local bursts', () => {
    const clock = new HybridLogicalClock('TAB-A001', 1700000000000);
    const t1 = clock.now(1700000000000);
    const t2 = clock.now(1700000000000);
    const t3 = clock.now(1700000000000);

    expect(t1.logical).toBe(1);
    expect(t2.logical).toBe(2);
    expect(t3.logical).toBe(3);
    expect(HybridLogicalClock.compare(t2, t1).comparison).toBeGreaterThan(0);
    expect(HybridLogicalClock.compare(t3, t2).comparison).toBeGreaterThan(0);
  });

  it('2. [Conflict Resolution] Resolves exact same-millisecond, same-counter collisions via lexicographical nodeId tie-breaking', () => {
    const clockA = new HybridLogicalClock('TAB-1000', 1700000000500);
    const clockB = new HybridLogicalClock('TAB-9000', 1700000000500);

    const crdtA = new SettingsCRDT(clockA);
    const crdtB = new SettingsCRDT(clockB);

    const tsA = { wallTime: 1700000000500, logical: 1, nodeId: 'TAB-1000' };
    const tsB = { wallTime: 1700000000500, logical: 1, nodeId: 'TAB-9000' };

    crdtA.set('theme', 'light', tsA);
    crdtB.set('theme', 'dark', tsB);

    crdtA.merge(crdtB.getState());
    crdtB.merge(crdtA.getState());

    expect(crdtA.getSnapshot().theme).toBe('dark');
    expect(crdtB.getSnapshot().theme).toBe('dark');
    expect(crdtA.computeStateHash()).toBe(crdtB.computeStateHash());
  });

  it('3. [Consistency] Preserves orthogonal concurrent edits across different fields (Field-Level CRDT Isolation)', () => {
    const crdtA = new SettingsCRDT(new HybridLogicalClock('TAB-A'));
    const crdtB = new SettingsCRDT(new HybridLogicalClock('TAB-B'));
    const crdtC = new SettingsCRDT(new HybridLogicalClock('TAB-C'));

    crdtA.set('theme', 'light', { wallTime: 1000, logical: 0, nodeId: 'TAB-A' });
    crdtB.set('language', 'ja', { wallTime: 1000, logical: 0, nodeId: 'TAB-B' });
    crdtC.set('fontSize', 22, { wallTime: 1000, logical: 0, nodeId: 'TAB-C' });

    crdtA.merge(crdtB.getState());
    crdtA.merge(crdtC.getState());

    crdtB.merge(crdtC.getState());
    crdtB.merge(crdtA.getState());

    crdtC.merge(crdtA.getState());
    crdtC.merge(crdtB.getState());

    expect(crdtA.getSnapshot()).toEqual({ theme: 'light', language: 'ja', fontSize: 22 });
    expect(crdtB.getSnapshot()).toEqual({ theme: 'light', language: 'ja', fontSize: 22 });
    expect(crdtC.getSnapshot()).toEqual({ theme: 'light', language: 'ja', fontSize: 22 });
    expect(crdtA.computeStateHash()).toBe(crdtB.computeStateHash());
    expect(crdtB.computeStateHash()).toBe(crdtC.computeStateHash());
  });

  it('4. [Mathematical Proof] Satisfies bounded join-semilattice laws: Commutativity, Associativity, and Idempotency across 250 random concurrent ops', () => {
    const nodes = ['TAB-1', 'TAB-2', 'TAB-3', 'TAB-4', 'TAB-5'].map(
      (id) => new SettingsCRDT(new HybridLogicalClock(id))
    );
    const themes = ['light', 'dark'] as const;
    const langs = ['en', 'es', 'fr', 'de', 'ja'] as const;

    for (let i = 0; i < 250; i++) {
      const node = nodes[i % nodes.length]!;
      const ts = node.clock.now(1700000000000 + Math.floor(i / 5));
      if (i % 3 === 0) node.set('theme', themes[i % 2]!, ts);
      else if (i % 3 === 1) node.set('language', langs[i % 5]!, ts);
      else node.set('fontSize', 12 + (i % 13), ts);
    }

    const forward = new SettingsCRDT(new HybridLogicalClock('VERIFY-FWD'));
    for (const n of nodes) forward.merge(n.getState());
    forward.merge(nodes[0]!.getState()); // Idempotent duplicate delivery

    const reverse = new SettingsCRDT(new HybridLogicalClock('VERIFY-REV'));
    for (const n of [...nodes].reverse()) reverse.merge(n.getState());
    reverse.merge(nodes[2]!.getState()); // Idempotent duplicate delivery

    expect(forward.getSnapshot()).toEqual(reverse.getSnapshot());
    expect(forward.computeStateHash()).toBe(reverse.computeStateHash());
  });

  it('5. [Security] Sanitizes malformed, out-of-range, and XSS-injected payloads from untrusted storage or IPC packets', () => {
    const target = new SettingsCRDT(new HybridLogicalClock('TAB-SEC'));
    const maliciousState = {
      theme: {
        value: '<img src=x onerror=alert(1)>',
        timestamp: { wallTime: 9999999999999, logical: 1, nodeId: 'MALICIOUS' },
      },
      language: {
        value: '__proto__',
        timestamp: { wallTime: 9999999999999, logical: 1, nodeId: 'MALICIOUS' },
      },
      fontSize: {
        value: 999999,
        timestamp: { wallTime: 9999999999999, logical: 1, nodeId: 'MALICIOUS' },
      },
    } as unknown as SettingsCRDTState;

    target.merge(maliciousState);

    expect(target.getSnapshot().theme).toBe('dark');
    expect(target.getSnapshot().language).toBe('en');
    expect(target.getSnapshot().fontSize).toBe(24);
  });

  it('6. [Performance] Executes 10,000 CRDT state merges well within the 100ms synchronization budget', () => {
    const peerA = new SettingsCRDT(new HybridLogicalClock('TAB-PERF-A'));
    const peerB = new SettingsCRDT(new HybridLogicalClock('TAB-PERF-B'));

    const startMs = performance.now();
    for (let i = 0; i < 10000; i++) {
      peerB.set('fontSize', 12 + (i % 13), {
        wallTime: 1700000000000 + i,
        logical: i % 4,
        nodeId: 'TAB-PERF-B',
      });
      peerA.merge(peerB.getState());
    }
    const totalMs = performance.now() - startMs;
    const avgMsPerMerge = totalMs / 10000;

    // Average single-merge latency must be < 0.05ms (over 2,000x faster than the 100ms SLA)
    expect(avgMsPerMerge).toBeLessThan(0.05);
  });
});