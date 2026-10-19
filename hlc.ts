/**
 * @file src/crdt/hlc.ts
 * @description Hybrid Logical Clock (HLC) implementation for deterministic
 * causal ordering and tie-breaking across concurrent browser tabs.
 */

import type { HLCTimestamp } from '../types/settings';

export class HybridLogicalClock {
  private lastWallTime: number;
  private lastLogical: number;
  public readonly nodeId: string;
  private simulatedClockSkewMs = 0;

  constructor(nodeId: string, initialWallTime = Date.now()) {
    this.nodeId = nodeId;
    this.lastWallTime = initialWallTime;
    this.lastLogical = 0;
  }

  /**
   * Optional clock-skew injection used by the built-in Chaos Simulator
   * to prove resilience against NTP adjustments or skewed tab clocks.
   */
  public setSimulatedSkewMs(skewMs: number): void {
    this.simulatedClockSkewMs = skewMs;
  }

  public getSimulatedSkewMs(): number {
    return this.simulatedClockSkewMs;
  }

  private physicalNow(): number {
    return Date.now() + this.simulatedClockSkewMs;
  }

  /**
   * Generates a strictly monotonic HLC timestamp for a local mutation event.
   */
  public now(explicitPhysicalTime?: number): HLCTimestamp {
    const physical = explicitPhysicalTime ?? this.physicalNow();
    if (physical > this.lastWallTime) {
      this.lastWallTime = physical;
      this.lastLogical = 0;
    } else {
      // Sub-millisecond burst or clock drift backward: advance logical counter
      this.lastLogical += 1;
    }
    return {
      wallTime: this.lastWallTime,
      logical: this.lastLogical,
      nodeId: this.nodeId,
    };
  }

  /**
   * Advances the local HLC upon receiving a remote timestamp from another tab,
   * preserving the causal happens-before relationship (e -> f => HLC(e) < HLC(f)).
   */
  public receive(remote: HLCTimestamp, explicitPhysicalTime?: number): HLCTimestamp {
    const physical = explicitPhysicalTime ?? this.physicalNow();
    if (physical > this.lastWallTime && physical > remote.wallTime) {
      this.lastWallTime = physical;
      this.lastLogical = 0;
    } else if (this.lastWallTime === remote.wallTime) {
      this.lastLogical = Math.max(this.lastLogical, remote.logical) + 1;
    } else if (remote.wallTime > this.lastWallTime) {
      this.lastWallTime = remote.wallTime;
      this.lastLogical = remote.logical + 1;
    } else {
      this.lastLogical += 1;
    }
    return {
      wallTime: this.lastWallTime,
      logical: this.lastLogical,
      nodeId: this.nodeId,
    };
  }

  /**
   * Deterministic Total Order Comparator:
   * Returns > 0 if `a` wins over `b`, < 0 if `b` wins over `a`, or 0 if identical.
   *
   * Tie-breaking hierarchy:
   *  1. Higher physical wallTime wins (`a.wallTime !== b.wallTime`)
   *  2. Higher causal logical counter wins (`a.logical !== b.logical`)
   *  3. Lexicographically higher nodeId wins (`a.nodeId.localeCompare(b.nodeId)`)
   */
  public static compare(a: HLCTimestamp, b: HLCTimestamp): {
    comparison: number;
    reason:
      | 'higher_wall_time'
      | 'higher_logical_counter'
      | 'lexicographical_node_id_tiebreak'
      | 'idempotent_duplicate';
  } {
    if (a.wallTime !== b.wallTime) {
      return {
        comparison: a.wallTime > b.wallTime ? 1 : -1,
        reason: 'higher_wall_time',
      };
    }
    if (a.logical !== b.logical) {
      return {
        comparison: a.logical > b.logical ? 1 : -1,
        reason: 'higher_logical_counter',
      };
    }
    if (a.nodeId !== b.nodeId) {
      return {
        comparison: a.nodeId > b.nodeId ? 1 : -1,
        reason: 'lexicographical_node_id_tiebreak',
      };
    }
    return {
      comparison: 0,
      reason: 'idempotent_duplicate',
    };
  }

  public static format(ts: HLCTimestamp): string {
    return `${ts.wallTime}:${String(ts.logical).padStart(3, '0')}@${ts.nodeId}`;
  }
}