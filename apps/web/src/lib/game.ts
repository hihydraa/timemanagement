export * from '../../../../src/lib/game';
import type { Honorific } from '../../../../src/lib/game';
import type { ToneId } from '../../../../src/lib/dobbyVoice';

export interface GameState {
  profile: {
    characterId: string;
    displayName: string;
    honorific: Honorific;
    dobbyName: string;
    tone: ToneId;
  } | null;
  balance: number;
  todayEarned: number;
  inventory: { itemId: string; equipped: boolean }[];
  recent: { kind: string; points: number; at: string; item: string | null }[];
}
