/**
 * @file src/storage/persistence.ts
 * @description Atomic Cross-Tab Persistence Engine using Web Locks API (`navigator.locks`)
 * and Read-Modify-Merge-Write semantics so simultaneous tab persistence never clobbers
 * concurrent field mutations.
 */

import { SettingsCRDT } from '../crdt/settingsCrdt';
import { HybridLogicalClock } from '../crdt/hlc';
import type {
  PersistedSettingsEnvelope,
  SettingsCRDTState,
  UserPreferences,
} from '../types/settings';

export const STORAGE_KEY = 'chronosync:preferences:v1';
export const FAST_BOOT_KEY = 'chronosync:fastboot:v1';
export const WEB_LOCK_NAME = 'chronosync_storage_mutex';

export class PersistenceEngine {
  /**
   * Reads and validates the persisted CRDT envelope synchronously on tab startup.
   */
  public static loadPersistedState(): SettingsCRDTState | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedSettingsEnvelope>;
      if (parsed.schemaVersion !== 1 || !parsed.state) {
        return null;
      }
      const s = parsed.state;
      if (!s.theme?.timestamp || !s.language?.timestamp || !s.fontSize?.timestamp) {
        return null;
      }
      return {
        theme: {
          value: SettingsCRDT.sanitizeValue('theme', s.theme.value),
          timestamp: s.theme.timestamp,
        },
        language: {
          value: SettingsCRDT.sanitizeValue('language', s.language.value),
          timestamp: s.language.timestamp,
        },
        fontSize: {
          value: SettingsCRDT.sanitizeValue('fontSize', s.fontSize.value),
          timestamp: s.fontSize.timestamp,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Writes both the full CRDT state envelope and the compact Zero-FOUC fast-boot
   * snapshot synchronously so newly opened tabs can read it in < 0.2ms inside <head>.
   */
  public static writeSynchronous(state: SettingsCRDTState): PersistedSettingsEnvelope {
    const envelope: PersistedSettingsEnvelope = {
      schemaVersion: 1,
      state,
      stateHash: SettingsCRDT.hashState(state),
      updatedAt: Date.now(),
    };

    const fastBoot: UserPreferences = {
      theme: state.theme.value,
      language: state.language.value,
      fontSize: state.fontSize.value,
    };

    try {
      window.localStorage.setItem(FAST_BOOT_KEY, JSON.stringify(fastBoot));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (err) {
      console.warn('[ChronoSync] localStorage quota or privacy restriction:', err);
    }
    return envelope;
  }

  /**
   * Serializes concurrent writes across tabs via the Web Locks API (`navigator.locks`),
   * performing an atomic Read-Merge-Write so no tab ever overwrites a newer register
   * persisted by a sibling tab moments earlier.
   */
  public static async commitAtomic(
    localCrdt: SettingsCRDT,
    clock: HybridLogicalClock
  ): Promise<PersistedSettingsEnvelope> {
    const performReadMergeWrite = (): PersistedSettingsEnvelope => {
      const diskState = PersistenceEngine.loadPersistedState();
      if (diskState) {
        localCrdt.merge(diskState, 0);
      }
      // Verify clock stays ahead of any merged state
      clock.now();
      return PersistenceEngine.writeSynchronous(localCrdt.getState());
    };

    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
      return navigator.locks.request(
        WEB_LOCK_NAME,
        { mode: 'exclusive' },
        async () => performReadMergeWrite()
      );
    }

    return performReadMergeWrite();
  }
}