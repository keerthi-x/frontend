/**
 * @file src/sync/multiTabTransport.ts
 * @description Multi-Transport Real-Time Synchronization Engine.
 * Combines:
 *  1. `BroadcastChannel` for ultra-low-latency (< 2ms) peer-to-peer frame & delta delivery
 *  2. `window.addEventListener('storage')` as an automatic fallback transport
 *  3. `requestAnimationFrame` coalescing for 60fps font-size slider updates
 *  4. Active Tab Discovery & Heartbeat Topology Mesh
 */

import { HybridLogicalClock } from '../crdt/hlc';
import { SettingsCRDT } from '../crdt/settingsCrdt';
import { PersistenceEngine, STORAGE_KEY } from '../storage/persistence';
import type {
  ConflictAuditEntry,
  PeerTabDescriptor,
  PreferenceKey,
  SettingsCRDTState,
  SyncEnvelope,
  UserPreferences,
} from '../types/settings';

export const CHANNEL_NAME = 'chronosync_multitab_mesh_v1';

export interface SyncEngineCallbacks {
  onPreferencesUpdated: (
    prefs: UserPreferences,
    state: SettingsCRDTState,
    changedKeys: PreferenceKey[],
    sourceTabId: string,
    latencyMs: number
  ) => void;
  onConflictAudited: (audits: ConflictAuditEntry[]) => void;
  onPeersChanged: (peers: PeerTabDescriptor[]) => void;
  onLatencySample: (latencyMs: number, transport: string) => void;
}

export class MultiTabSyncEngine {
  public readonly tabId: string;
  public readonly clock: HybridLogicalClock;
  public readonly crdt: SettingsCRDT;

  private channel: BroadcastChannel | null = null;
  private readonly peers = new Map<string, PeerTabDescriptor>();
  private readonly callbacks: SyncEngineCallbacks;
  private heartbeatTimer: number | null = null;
  private rafPendingKey: PreferenceKey | null = null;
  private storageCommitTimer: number | null = null;
  private simulatedNetworkDelayMs = 0;

  constructor(callbacks: SyncEngineCallbacks) {
    this.tabId = MultiTabSyncEngine.generateTabId();
    this.clock = new HybridLogicalClock(this.tabId);
    const persisted = PersistenceEngine.loadPersistedState();
    this.crdt = new SettingsCRDT(this.clock, persisted ?? undefined);
    this.callbacks = callbacks;

    // Advance HLC past any restored timestamps from disk
    if (persisted) {
      this.clock.receive(persisted.theme.timestamp);
      this.clock.receive(persisted.language.timestamp);
      this.clock.receive(persisted.fontSize.timestamp);
    } else {
      // Persist initial state so newly opened tabs have a canonical baseline
      PersistenceEngine.writeSynchronous(this.crdt.getState());
    }

    this.initBroadcastChannel();
    this.initStorageFallbackListener();
    this.initLifecycleHooks();
    this.startHeartbeatMesh();
  }

  private static generateTabId(): string {
    const randomHex = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    )
      .join('')
      .toUpperCase();
    return `TAB-${randomHex}`;
  }

  public setSimulatedNetworkDelayMs(delayMs: number): void {
    this.simulatedNetworkDelayMs = Math.max(0, Math.min(500, delayMs));
  }

  public getSimulatedNetworkDelayMs(): number {
    return this.simulatedNetworkDelayMs;
  }

  private nowPerf(): number {
    return performance.timeOrigin + performance.now();
  }

  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SyncEnvelope>) => {
        const packet = event.data;
        if (!packet || packet.protocol !== 'chronosync:v1') return;
        if (packet.senderTabId === this.tabId) return;

        const receivePerf = this.nowPerf();
        const rawLatency = Math.max(0.1, receivePerf - packet.sentAtPerfTime);

        const processPacket = () => {
          const totalLatency = rawLatency + this.simulatedNetworkDelayMs;
          this.handleIncomingPacket(packet, totalLatency, 'BroadcastChannel');
        };

        if (this.simulatedNetworkDelayMs > 0) {
          window.setTimeout(processPacket, this.simulatedNetworkDelayMs);
        } else {
          processPacket();
        }
      };
    } catch (err) {
      console.warn('[ChronoSync] BroadcastChannel unavailable, using storage fallback:', err);
    }
  }

  private initStorageFallbackListener(): void {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue);
        if (!parsed?.state) return;
        const remoteState = parsed.state as SettingsCRDTState;
        const latencyMs = Math.max(0.8, Date.now() - (parsed.updatedAt || Date.now()));
        const { changedKeys, audits } = this.crdt.merge(remoteState, latencyMs);

        if (audits.length > 0) {
          this.callbacks.onConflictAudited(audits);
        }
        if (changedKeys.length > 0) {
          this.callbacks.onLatencySample(latencyMs, 'localStorage');
          this.callbacks.onPreferencesUpdated(
            this.crdt.getSnapshot(),
            this.crdt.getState(),
            changedKeys,
            'STORAGE-EVENT',
            latencyMs
          );
        }
      } catch {
        // Ignore malformed external edits
      }
    });
  }

  private initLifecycleHooks(): void {
    window.addEventListener('beforeunload', () => {
      this.broadcast({
        protocol: 'chronosync:v1',
        type: 'TAB_GOODBYE',
        senderTabId: this.tabId,
        sentAtPerfTime: this.nowPerf(),
        hlc: this.clock.now(),
        stateHash: this.crdt.computeStateHash(),
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const diskState = PersistenceEngine.loadPersistedState();
        if (diskState) {
          const { changedKeys } = this.crdt.merge(diskState, 0.5);
          if (changedKeys.length > 0) {
            this.callbacks.onPreferencesUpdated(
              this.crdt.getSnapshot(),
              this.crdt.getState(),
              changedKeys,
              'DISK-RECONCILE',
              0.5
            );
          }
        }
        this.sendPing();
      }
    });
  }

  private startHeartbeatMesh(): void {
    // Immediately announce presence and request state verification from open tabs
    this.sendPing();
    this.heartbeatTimer = window.setInterval(() => {
      this.pruneStalePeers();
      this.sendPing();
    }, 2500);
  }

  public sendPing(): void {
    this.broadcast({
      protocol: 'chronosync:v1',
      type: 'HEARTBEAT_PING',
      senderTabId: this.tabId,
      sentAtPerfTime: this.nowPerf(),
      hlc: this.clock.now(),
      state: this.crdt.getState(),
      stateHash: this.crdt.computeStateHash(),
    });
  }

  private pruneStalePeers(): void {
    const cutoff = Date.now() - 7000;
    let removed = false;
    for (const [id, peer] of this.peers.entries()) {
      if (peer.transport !== 'SimulatedPeer' && peer.lastSeen < cutoff) {
        this.peers.delete(id);
        removed = true;
      }
    }
    if (removed) {
      this.callbacks.onPeersChanged(this.getPeers());
    }
  }

  public getPeers(): PeerTabDescriptor[] {
    return Array.from(this.peers.values()).sort((a, b) =>
      a.tabId.localeCompare(b.tabId)
    );
  }

  /**
   * Mutates a preference from the current tab.
   * - Immediately updates local CRDT state
   * - Streams low-latency BroadcastChannel delta coalesced on requestAnimationFrame
   * - Commits durable state via Web Locks API (`navigator.locks`)
   */
  public updatePreference<K extends PreferenceKey>(
    key: K,
    value: UserPreferences[K],
    options: { isHighFrequencySlider?: boolean } = {}
  ): void {
    this.crdt.set(key, value);

    // Notify local UI immediately (0ms local responsiveness)
    this.callbacks.onPreferencesUpdated(
      this.crdt.getSnapshot(),
      this.crdt.getState(),
      [key],
      this.tabId,
      0
    );

    if (options.isHighFrequencySlider) {
      // Coalesce rapid slider drags onto requestAnimationFrame for <2ms 60fps cross-tab streaming
      if (!this.rafPendingKey) {
        this.rafPendingKey = key;
        window.requestAnimationFrame(() => {
          const pending = this.rafPendingKey;
          this.rafPendingKey = null;
          if (pending) {
            this.broadcastMutation(pending, true);
          }
        });
      }
      // Debounce durable Web Locks storage write by 45ms during continuous slider drag
      if (this.storageCommitTimer !== null) {
        window.clearTimeout(this.storageCommitTimer);
      }
      this.storageCommitTimer = window.setTimeout(() => {
        void PersistenceEngine.commitAtomic(this.crdt, this.clock);
      }, 45);
    } else {
      this.broadcastMutation(key, false);
      void PersistenceEngine.commitAtomic(this.crdt, this.clock);
    }
  }

  private broadcastMutation(key: PreferenceKey, isEphemeralPreview: boolean): void {
    this.broadcast({
      protocol: 'chronosync:v1',
      type: 'DELTA_MUTATION',
      senderTabId: this.tabId,
      sentAtPerfTime: this.nowPerf(),
      hlc: this.crdt.getState()[key].timestamp,
      state: this.crdt.getState(),
      mutatedKey: key,
      isEphemeralPreview,
      stateHash: this.crdt.computeStateHash(),
    });
  }

  public handleIncomingPacket(
    packet: SyncEnvelope,
    latencyMs: number,
    transport: PeerTabDescriptor['transport']
  ): void {
    if (packet.type === 'TAB_GOODBYE') {
      this.peers.delete(packet.senderTabId);
      this.callbacks.onPeersChanged(this.getPeers());
      return;
    }

    this.peers.set(packet.senderTabId, {
      tabId: packet.senderTabId,
      lastSeen: Date.now(),
      latencyMs: Number(latencyMs.toFixed(2)),
      stateHash: packet.stateHash,
      transport,
    });

    if (packet.type === 'HEARTBEAT_PING') {
      this.broadcast({
        protocol: 'chronosync:v1',
        type: 'HEARTBEAT_PONG',
        senderTabId: this.tabId,
        sentAtPerfTime: this.nowPerf(),
        hlc: this.clock.now(),
        state: this.crdt.getState(),
        stateHash: this.crdt.computeStateHash(),
      });
    }

    if (packet.state) {
      const { changedKeys, audits } = this.crdt.merge(packet.state, latencyMs);

      // Update peer hash after convergence
      const convergedHash = this.crdt.computeStateHash();
      this.peers.set(packet.senderTabId, {
        tabId: packet.senderTabId,
        lastSeen: Date.now(),
        latencyMs: Number(latencyMs.toFixed(2)),
        stateHash: convergedHash,
        transport,
      });

      if (
        packet.type === 'DELTA_MUTATION' ||
        packet.type === 'CHAOS_SIMULATION' ||
        changedKeys.length > 0
      ) {
        this.callbacks.onLatencySample(latencyMs, transport);
        if (audits.length > 0) {
          this.callbacks.onConflictAudited(audits);
        }
      }

      if (changedKeys.length > 0) {
        if (!packet.isEphemeralPreview) {
          PersistenceEngine.writeSynchronous(this.crdt.getState());
        }
        this.callbacks.onPreferencesUpdated(
          this.crdt.getSnapshot(),
          this.crdt.getState(),
          changedKeys,
          packet.senderTabId,
          latencyMs
        );
      }
    }

    this.callbacks.onPeersChanged(this.getPeers());
  }

  public broadcast(envelope: SyncEnvelope): void {
    if (this.channel) {
      try {
        this.channel.postMessage(envelope);
      } catch {
        // Channel closed or unavailable
      }
    }
  }

  public destroy(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
    }
    if (this.channel) {
      this.channel.close();
    }
  }
}