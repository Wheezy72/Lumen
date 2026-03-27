import RecurringScan from '../models/RecurringScan.js';
import { scanQueue } from './scanQueue.js';
import { logger } from '../utils/logger.js';

let recurringSyncPromise = null;

export const syncRecurringSchedules = async () => {
  if (recurringSyncPromise) return recurringSyncPromise;

  recurringSyncPromise = (async () => {
    try {
      const enabled = await RecurringScan.find({ enabled: true }).select('_id cron timezone').lean();

      await Promise.all(
        enabled.map((recurring) => {
          const tz = recurring.timezone || undefined;
          const repeat = tz ? { cron: recurring.cron, tz } : { cron: recurring.cron };

          return scanQueue.add(
            'recurringTick',
            { recurringScanId: recurring._id.toString() },
            {
              jobId: `recurring:${recurring._id.toString()}`,
              repeat,
            },
          );
        }),
      );

      if (enabled.length) {
        logger.info('Recurring scan schedules synced', { count: enabled.length });
      }
    } catch (e) {
      logger.warn('Recurring scan schedule sync failed', { error: e.message });
    }
  })().finally(() => {
    recurringSyncPromise = null;
  });

  return recurringSyncPromise;
};
