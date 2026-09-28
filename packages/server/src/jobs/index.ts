import cron from 'node-cron';
import { runCycleManager } from './cycleManager.js';
import { runReminderScheduler } from './reminderScheduler.js';
import { runReminderDispatcher } from './reminderDispatcher.js';

// Export job functions for manual triggering
export { runReminderScheduler, runReminderDispatcher };

/**
 * Initialize all scheduled jobs
 */
export function initializeJobs() {
  console.log('[Jobs] Initializing scheduled jobs');

  // Run cycle manager daily at 01:00 UTC
  // Cron pattern: '0 1 * * *' = minute 0, hour 1, every day, every month, every day of week
  const cycleManagerJob = cron.schedule(
    '0 1 * * *',
    async () => {
      console.log('[Jobs] Triggering cycle manager job');
      try {
        const stats = await runCycleManager();
        console.log('[Jobs] Cycle manager completed successfully:', stats);
      } catch (error) {
        console.error('[Jobs] Cycle manager failed:', error);
        // Job will retry next day
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    },
  );

  console.log('[Jobs] Cycle manager scheduled to run daily at 01:00 UTC');

  // Run reminder scheduler daily at 00:00 UTC
  // Generates reminders based on notification preferences
  const reminderSchedulerJob = cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('[Jobs] Triggering reminder scheduler job');
      try {
        await runReminderScheduler();
        console.log('[Jobs] Reminder scheduler completed successfully');
      } catch (error) {
        console.error('[Jobs] Reminder scheduler failed:', error);
        // Job will retry next day
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    },
  );

  console.log('[Jobs] Reminder scheduler scheduled to run daily at 00:00 UTC');

  // Run reminder dispatcher every 15 minutes
  // Dispatches scheduled reminders that are due
  const reminderDispatcherJob = cron.schedule(
    '*/15 * * * *',
    async () => {
      console.log('[Jobs] Triggering reminder dispatcher job');
      try {
        await runReminderDispatcher();
        console.log('[Jobs] Reminder dispatcher completed successfully');
      } catch (error) {
        console.error('[Jobs] Reminder dispatcher failed:', error);
        // Job will retry in 15 minutes
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    },
  );

  console.log('[Jobs] Reminder dispatcher scheduled to run every 15 minutes');

  // Return job instances for potential management (start/stop)
  return {
    cycleManagerJob,
    reminderSchedulerJob,
    reminderDispatcherJob,
  };
}

/**
 * Stop all scheduled jobs (useful for graceful shutdown)
 */
export function stopAllJobs(jobs: ReturnType<typeof initializeJobs>) {
  console.log('[Jobs] Stopping all scheduled jobs');
  jobs.cycleManagerJob.stop();
  jobs.reminderSchedulerJob.stop();
  jobs.reminderDispatcherJob.stop();
  console.log('[Jobs] All jobs stopped');
}
