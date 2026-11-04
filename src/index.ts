import { app } from './app';
import type { Env } from './types';

export default {
  fetch: app.fetch,
  // Phase 5: reminders / digest
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {},
} satisfies ExportedHandler<Env>;
