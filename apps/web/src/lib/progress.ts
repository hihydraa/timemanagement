export * from '../../../../src/lib/progress';
import type { LevelInfo, QuestState } from '../../../../src/lib/progress';

export interface ProgressState {
  level: LevelInfo;
  streak: number;
  quests: QuestState[];
  badges: { id: string; th: string; hint: string; icon: string; earned: boolean }[];
}
export interface ClaimResult {
  reward: number;
  balance: number;
  levelUp: number | null;
}
