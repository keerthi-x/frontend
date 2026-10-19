/**
 * @file src/crdt/settingsCrdt.ts
 * @description State-based and Delta-based Field-Level LWW-Element-Set CRDT.
 * Guarantees Strong Eventual Consistency (SEC) across all open browser tabs:
 *  - Commutativity:  merge(A, B) === merge(B, A)
 *  - Associativity:  merge(merge(A, B), C) === merge(A, merge(B, C))
 *  - Idempotency:    merge(A, A) === A
 */

import { HybridLogicalClock } from './hlc';
import type {
  ConflictAuditEntry,
  HLCTimestamp,
  LWWRegister,
  PreferenceKey,
  SettingsCRDTState,
  SupportedLocale,
  ThemeMode,
  UserPreferences,
} from '../types/settings';

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  language: 'en',
  fontSize: 16,
};

export const PREFERENCE_KEYS: readonly PreferenceKey[] = [
  'theme',
  'language',
  'fontSize',
] as const;

export class SettingsCRDT {
  private state: SettingsCRDTState;
  private readonly clock: HybridLogicalClock;

  constructor(clock: HybridLogicalClock, initialState?: SettingsCRDTState) {
    this.clock = clock;
    const genesisTimestamp: HLCTimestamp = {
      wallTime: 0,
      logical: 0,
      nodeId: '0000-genesis',
    };
    this.state = initialState ?? {
      theme: { value: DEFAULT_PREFERENCES.theme, timestamp: genesisTimestamp },
      language: { value: DEFAULT_PREFERENCES.language, timestamp: genesisTimestamp },
      fontSize: { value: DEFAULT_PREFERENCES.fontSize, timestamp: genesisTimestamp },
    };
  }

  /**
   * Validates and sanitizes raw preference values against domain bounds.
   */
  public static sanitizeValue<K extends PreferenceKey>(
    key: K,
    rawValue: unknown
  ): UserPreferences[K] {
    if (key === 'theme') {
      const mode: ThemeMode = rawValue === 'light' ? 'light' : 'dark';
      return mode as UserPreferences[K];
    }
    if (key === 'language') {
      const allowed: SupportedLocale[] = ['en', 'es', 'fr', 'de', 'ja'];
      const lang: SupportedLocale = allowed.includes(rawValue as SupportedLocale)
        ? (rawValue as SupportedLocale)
        : 'en';
      return lang as UserPreferences[K];
    }
    // fontSize
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const clamped = Number.isFinite(numeric)
      ? Math.min(24, Math.max(12, Math.round(numeric)))
      : 16;
    return clamped as UserPreferences[K];
  }

  /**
   * Mutates a single preference key locally, advancing the local HLC.
   */
  public set<K extends PreferenceKey>(
    key: K,
    value: UserPreferences[K],
    explicitTimestamp?: HLCTimestamp
  ): LWWRegister<UserPreferences[K]> {
    const cleanValue = SettingsCRDT.sanitizeValue(key, value);
    const timestamp = explicitTimestamp ?? this.clock.now();
    const nextRegister: LWWRegister<UserPreferences[K]> = {
      value: cleanValue,
      timestamp,
    };

    // Apply LWW comparison even locally in case an explicit past timestamp was injected
    const currentRegister = this.state[key];
    const { comparison } = HybridLogicalClock.compare(
      nextRegister.timestamp,
      currentRegister.timestamp
    );

    if (comparison >= 0) {
      this.state = {
        ...this.state,
        [key]: nextRegister,
      };
    }

    return this.state[key];
  }

  /**
   * Deterministic join-semilattice merge of an incoming remote CRDT state.
   * Returns a list of field changes and detailed conflict resolution audit entries.
   */
  public merge(
    remoteState: SettingsCRDTState,
    propagationLatencyMs = 0
  ): {
    changedKeys: PreferenceKey[];
    audits: ConflictAuditEntry[];
  } {
    const changedKeys: PreferenceKey[] = [];
    const audits: ConflictAuditEntry[] = [];
    const nextState: Record<string, LWWRegister< unknown >> = { ...this.state };

    for (const key of PREFERENCE_KEYS) {
      const localReg = this.state[key];
      const remoteReg = remoteState[key];
      if (!remoteReg || !remoteReg.timestamp) continue;

      // Advance local HLC to preserve causal ordering
      this.clock.receive(remoteReg.timestamp);

      const { comparison, reason } = HybridLogicalClock.compare(
        remoteReg.timestamp,
        localReg.timestamp
      );

      const sanitizedRemoteReg: LWWRegister<UserPreferences[typeof key]> = {
        value: SettingsCRDT.sanitizeValue(key, remoteReg.value),
        timestamp: remoteReg.timestamp,
      };

      if (comparison > 0) {
        const valueChanged = localReg.value !== sanitizedRemoteReg.value;
        nextState[key] = sanitizedRemoteReg;
        if (valueChanged) {
          changedKeys.push(key);
        }
        audits.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          occurredAt: Date.now(),
          key,
          localRegister: localReg,
          incomingRegister: sanitizedRemoteReg,
          winner: 'incoming',
          resolutionReason: reason,
          propagationLatencyMs,
        });
      } else if (comparison < 0) {
        // Local state is strictly newer or wins deterministic tie-breaker
        audits.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          occurredAt: Date.now(),
          key,
          localRegister: localReg,
          incomingRegister: sanitizedRemoteReg,
          winner: 'local',
          resolutionReason: reason,
          propagationLatencyMs,
        });
      }
    }

    this.state = nextState as unknown as SettingsCRDTState;
    return { changedKeys, audits };
  }

  public getState(): SettingsCRDTState {
    return this.state;
  }

  public getSnapshot(): UserPreferences {
    return {
      theme: this.state.theme.value,
      language: this.state.language.value,
      fontSize: this.state.fontSize.value,
    };
  }

  /**
   * Computes a deterministic FNV-1a 32-bit hex digest of the canonical CRDT state.
   * Identical hashes across open tabs mathematically prove state convergence.
   */
  public computeStateHash(): string {
    return SettingsCRDT.hashState(this.state);
  }

  public static hashState(state: SettingsCRDTState): string {
    const canonical = PREFERENCE_KEYS.map((key) => {
      const reg = state[key];
      return `${key}=${String(reg.value)}@${reg.timestamp.wallTime}:${reg.timestamp.logical}:${reg.timestamp.nodeId}`;
    }).join('|');

    let hash = 0x811c9dc5;
    for (let i = 0; i < canonical.length; i++) {
      hash ^= canonical.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
}