/**
 * @file src/main.ts
 * @description Entry point mounting the MultiTabSyncEngine, Zero-FOUC DOM bindings,
 * Live Telemetry HUD, and Deterministic Conflict Simulator.
 */

import { MultiTabSyncEngine } from './sync/multiTabTransport';
import { LOCALES } from './i18n/locales';
import { HybridLogicalClock } from './crdt/hlc';
import type {
  ConflictAuditEntry,
  PeerTabDescriptor,
  PreferenceKey,
  SettingsCRDTState,
  SupportedLocale,
  UserPreferences,
} from './types/settings';

export function bootstrapApp(): MultiTabSyncEngine {
  const applyPreferencesToDOM = (prefs: UserPreferences) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', prefs.theme);
    root.style.colorScheme = prefs.theme;
    root.style.setProperty('--user-font-size', `${prefs.fontSize}px`);
    root.setAttribute('lang', prefs.language);
  };

  const engine = new MultiTabSyncEngine({
    onPreferencesUpdated: (
      prefs: UserPreferences,
      state: SettingsCRDTState,
      changedKeys: PreferenceKey[],
      sourceTabId: string,
      latencyMs: number
    ) => {
      applyPreferencesToDOM(prefs);
      window.dispatchEvent(
        new CustomEvent('chronosync:updated', {
          detail: { prefs, state, changedKeys, sourceTabId, latencyMs },
        })
      );
    },
    onConflictAudited: (audits: ConflictAuditEntry[]) => {
      window.dispatchEvent(
        new CustomEvent('chronosync:audits', { detail: { audits } })
      );
    },
    onPeersChanged: (peers: PeerTabDescriptor[]) => {
      window.dispatchEvent(
        new CustomEvent('chronosync:peers', { detail: { peers } })
      );
    },
    onLatencySample: (latencyMs: number, transport: string) => {
      window.dispatchEvent(
        new CustomEvent('chronosync:latency', { detail: { latencyMs, transport } })
      );
    },
  });

  // Immediately synchronize DOM with restored CRDT snapshot
  applyPreferencesToDOM(engine.crdt.getSnapshot());
  console.info(
    `[ChronoSync] Initialized ${engine.tabId} | State Hash #${engine.crdt.computeStateHash()} | HLC ${HybridLogicalClock.format(
      engine.crdt.getState().theme.timestamp
    )}`
  );

  return engine;
}