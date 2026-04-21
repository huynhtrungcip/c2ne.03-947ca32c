/**
 * mockEvents.ts — DEPRECATED random generator.
 *
 * Replaced by src/data/historicalDataset.ts which contains a hand-crafted,
 * deterministic 5-day APT storyline (2026-04-20 → 2026-04-24) used as the
 * baseline before the live demo on 2026-04-25.
 *
 * This file is kept as a thin compatibility shim so existing imports
 * (SettingsModal "Add Mock Data" button) keep working.
 */

import { SOCEvent } from '@/types/soc';
import { historicalEvents } from './historicalDataset';

/** Returns the fixed 5-day historical dataset (count is ignored). */
export const generateMockEvents = (_count?: number): SOCEvent[] =>
  historicalEvents.map(e => ({ ...e }));

/** Default export — same fixed dataset. */
export const mockEvents: SOCEvent[] = historicalEvents;
