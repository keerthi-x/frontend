/**
 * @file src/i18n/locales.ts
 * @description Multi-language dictionary supporting 5 locales (EN, ES, FR, DE, JA)
 * for instant, reactive cross-tab localization.
 */

import type { SupportedLocale } from '../types/settings';

export interface TranslationBundle {
  readonly code: SupportedLocale;
  readonly nativeName: string;
  readonly flag: string;
  readonly appSubtitle: string;
  readonly controlsTitle: string;
  readonly themeLabel: string;
  readonly themeDark: string;
  readonly themeLight: string;
  readonly languageLabel: string;
  readonly fontSizeLabel: string;
  readonly resetDefaults: string;
  readonly openNewTab: string;
  readonly previewBadge: string;
  readonly previewHeadline: string;
  readonly previewBody: string;
  readonly previewQuote: string;
  readonly statusConverged: string;
  readonly latencyTargetLabel: string;
}

export const LOCALES: Record<SupportedLocale, TranslationBundle> = {
  en: {
    code: 'en',
    nativeName: 'English (US)',
    flag: 'US',
    appSubtitle: 'Real-Time Cross-Tab CRDT Preference Synchronization Engine',
    controlsTitle: 'User Preferences',
    themeLabel: 'Appearance Theme',
    themeDark: 'Dark Mode',
    themeLight: 'Light Mode',
    languageLabel: 'Interface Language',
    fontSizeLabel: 'Typography Scale',
    resetDefaults: 'Reset Defaults',
    openNewTab: 'Open Companion Tab',
    previewBadge: 'LIVE TYPOGRAPHY & LOCALE SPECIMEN',
    previewHeadline: 'Deterministic State Convergence Across Browser Contexts',
    previewBody:
      'Every preference mutation is wrapped in a Field-Level Last-Write-Wins Element-Set (LWW-Element-Set) CRDT stamped with a Hybrid Logical Clock (HLC). Changes propagate across all open tabs in under 2 milliseconds via BroadcastChannel with atomic Web Locks storage persistence and zero theme flash on startup.',
    previewQuote:
      '“Simultaneous edits to distinct fields merge cleanly without data loss; exact same-millisecond collisions on the same field resolve deterministically via logical counters and lexicographical tab node IDs.”',
    statusConverged: 'All Open Tabs Converged',
    latencyTargetLabel: 'SLA Target: < 100ms',
  },
  es: {
    code: 'es',
    nativeName: 'Español',
    flag: 'ES',
    appSubtitle: 'Motor de Sincronización de Preferencias Multi-Pestaña en Tiempo Real (CRDT)',
    controlsTitle: 'Preferencias del Usuario',
    themeLabel: 'Tema de Apariencia',
    themeDark: 'Modo Oscuro',
    themeLight: 'Modo Claro',
    languageLabel: 'Idioma de la Interfaz',
    fontSizeLabel: 'Escala Tipográfica',
    resetDefaults: 'Restablecer Valores',
    openNewTab: 'Abrir Pestaña Nueva',
    previewBadge: 'MUESTRA DE TIPOGRAFÍA E IDIOMA EN VIVO',
    previewHeadline: 'Convergencia Determinista de Estado Entre Pestañas del Navegador',
    previewBody:
      'Cada cambio de preferencia se encapsula en un registro CRDT LWW-Element-Set por campo con un Reloj Lógico Híbrido (HLC). Las actualizaciones se propagan a todas las pestañas abiertas en menos de 2 milisegundos mediante BroadcastChannel sin parpadeo visual al iniciar.',
    previewQuote:
      '«Las ediciones simultáneas en distintos campos se fusionan sin pérdida de datos; las colisiones en el mismo milisegundo se resuelven de forma determinista mediante contadores lógicos y el identificador de nodo.»',
    statusConverged: 'Pestañas Sincronizadas',
    latencyTargetLabel: 'Objetivo SLA: < 100ms',
  },
  fr: {
    code: 'fr',
    nativeName: 'Français',
    flag: 'FR',
    appSubtitle: 'Moteur de Synchronisation Multi-Onglets en Temps Réel par CRDT',
    controlsTitle: 'Préférences Utilisateur',
    themeLabel: 'Thème d’Apparence',
    themeDark: 'Mode Sombre',
    themeLight: 'Mode Clair',
    languageLabel: 'Langue de l’Interface',
    fontSizeLabel: 'Échelle Typographique',
    resetDefaults: 'Réinitialiser',
    openNewTab: 'Ouvrir un Nouvel Onglet',
    previewBadge: 'APERÇU TYPOGRAPHIQUE ET MULTILINGUE EN DIRECT',
    previewHeadline: 'Convergence Déterministe de l’État Entre les Onglets du Navigateur',
    previewBody:
      'Chaque modification de préférence est stockée dans un registre CRDT LWW par propriété doté d’une Horloge Logique Hybride (HLC). Les changements se propagent à tous les onglets ouverts en moins de 2 millisecondes via BroadcastChannel sans flash de thème au chargement.',
    previewQuote:
      '« Les modifications simultanées sur différents champs fusionnent sans perte ; les collisions à la même milliseconde sont résolues de façon déterministe par compteur logique et identifiant d’onglet. »',
    statusConverged: 'Tous les Onglets Convergés',
    latencyTargetLabel: 'Cible SLA : < 100ms',
  },
  de: {
    code: 'de',
    nativeName: 'Deutsch',
    flag: 'DE',
    appSubtitle: 'Echtzeit-Tab-Synchronisations-Engine mit CRDT & Hybrider Logischer Uhr',
    controlsTitle: 'Benutzereinstellungen',
    themeLabel: 'Erscheinungsbild',
    themeDark: 'Dunkelmodus',
    themeLight: 'Hellmodus',
    languageLabel: 'Oberflächensprache',
    fontSizeLabel: 'Schriftgröße',
    resetDefaults: 'Zurücksetzen',
    openNewTab: 'Neuen Tab Öffnen',
    previewBadge: 'LIVE-TYPOGRAFIE- & SPRACHVORSCHAU',
    previewHeadline: 'Deterministische Zustandskonvergenz über Browser-Tabs hinweg',
    previewBody:
      'Jede Einstellungsänderung wird in einem feldbasierten LWW-Element-Set-CRDT mit Hybrider Logischer Uhr (HLC) gespeichert. Änderungen werden in unter 2 Millisekunden über BroadcastChannel ohne Theme-Flackern beim Öffnen neuer Tabs übertragen.',
    previewQuote:
      '„Gleichzeitige Änderungen an verschiedenen Feldern werden verlustfrei zusammengeführt; millisekundengenaue Kollisionen werden deterministisch über logische Zähler und Tab-Knoten-IDs aufgelöst.“',
    statusConverged: 'Alle Tabs Synchronisiert',
    latencyTargetLabel: 'SLA-Ziel: < 100ms',
  },
  ja: {
    code: 'ja',
    nativeName: '日本語',
    flag: 'JP',
    appSubtitle: 'CRDTとハイブリッド論理時計によるリアルタイム・マルチタブ設定同期エンジン',
    controlsTitle: 'ユーザー環境設定',
    themeLabel: '外観テーマ',
    themeDark: 'ダークモード',
    themeLight: 'ライトモード',
    languageLabel: '表示言語',
    fontSizeLabel: 'フォントサイズ',
    resetDefaults: '初期設定に戻す',
    openNewTab: '新しいタブを開く',
    previewBadge: 'リアルタイム・タイポグラフィ＆多言語プレビュー',
    previewHeadline: '複数のブラウザタブ間での決定論的な状態収束',
    previewBody:
      'すべての設定変更はハイブリッド論理時計（HLC）を備えたフィールド単位のLWW-Element-Set CRDTに記録されます。BroadcastChannelとWeb Locks APIにより2ミリ秒未満で全タブに即時反映され、新規タブ起動時の画面チラつき（FOUC）も完全に防止します。',
    previewQuote:
      '「異なる項目の同時編集はデータ損失なくマージされ、同一ミリ秒の競合も論理カウンタとタブIDの辞書順比較によってすべてのタブで完全に同一の値へ収束します。」',
    statusConverged: '全タブの状態が一致',
    latencyTargetLabel: '目標遅延: 100ms以内',
  },
};