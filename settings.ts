/**
 * @file src/types/settings.ts
 * @description Strict domain types for user preferences, Hybrid Logical Clocks (HLC),
 * Field-Level LWW-Element-Set CRDT registers, and multi-transport sync telemetry.
 */

export type ThemeMode = 'light' | 'dark';

export type SupportedLocale = 'en' | 'es' | 'fr' | 'de' | 'ja';

export interface UserPreferences {
  readonly theme: ThemeMode;
  readonly language: SupportedLocale;
  readonly fontSize: number; // Clamped between 12px and 24px
}

export type PreferenceKey = keyof UserPreferences;

/**
 * Hybrid Logical Clock (HLC) timestamp based on Kulkarni et al. (2014).
 * Provides a strict total ordering across distributed browser tabs even under
 * sub-millisecond concurrent edits or local clock drift.
 */
export interface HLCTimestamp {
  /** Monotonic physical wall-clock time in milliseconds (epoch) */
  readonly wallTime: number;
  /** Causality counter incremented when multiple events share the same wallTime */
  readonly logical: number;
  /** Unique deterministic identifier for the originating browser tab */
  readonly nodeId: string;
}

/**
 * Individual LWW (Last-Write-Wins) CRDT Register wrapping a single preference field.
 */
export interface LWWRegister<T> {
  readonly value: T;
  readonly timestamp: HLCTimestamp;
}

/**
 * Complete State-based LWW-Element-Set CRDT representing all user preferences.
 * Because each field has its own HLC register, concurrent edits to DIFFERENT fields
 * in separate tabs merge cleanly without overwriting one another.
 */
export type SettingsCRDTState = {
  readonly [K in PreferenceKey]: LWWRegister<UserPreferences[K]>;
};

/**
 * Serialized snapshot stored in localStorage for Zero-FOUC synchronous initialization
 * and cross-session persistence.
 */
export interface PersistedSettingsEnvelope {
  readonly schemaVersion: 1;
  readonly state: SettingsCRDTState;
  readonly stateHash: string;
  readonly updatedAt: number;
}

export type SyncMessageType =
  | 'DELTA_MUTATION'
  | 'FULL_STATE_SYNC'
  | 'HEARTBEAT_PING'
  | 'HEARTBEAT_PONG'
  | 'TAB_GOODBYE'
  | 'CHAOS_SIMULATION';

export interface SyncEnvelope {
  readonly protocol: 'chronosync:v1';
  readonly type: SyncMessageType;
  readonly senderTabId: string;
  readonly sentAtPerfTime: number; // performance.timeOrigin + performance.now()
  readonly hlc: HLCTimestamp;
  readonly state?: SettingsCRDTState;
  readonly mutatedKey?: PreferenceKey;
  readonly isEphemeralPreview?: boolean;
  readonly stateHash: string;
}

export interface PeerTabDescriptor {
  readonly tabId: string;
  readonly lastSeen: number;
  readonly latencyMs: number;
  readonly stateHash: string;
  readonly transport: 'BroadcastChannel' | 'localStorage' | 'SimulatedPeer';
}

export interface ConflictAuditEntry {
  readonly id: string;
  readonly occurredAt: number;
  readonly key: PreferenceKey;
  readonly localRegister: LWWRegister<UserPreferences[PreferenceKey]>;
  readonly incomingRegister: LWWRegister<UserPreferences[PreferenceKey]>;
  readonly winner: 'local' | 'incoming' | 'identical';
  readonly resolutionReason:
    | 'higher_wall_time'
    | 'higher_logical_counter'
    | 'lexicographical_node_id_tiebreak'
    | 'idempotent_duplicate';
  readonly propagationLatencyMs: number;
}