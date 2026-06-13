import { logger } from "./Logger";

const log = logger.child({ comp: "polling" });

/**
 * Starts a polling loop that executes the given async task effectively recursively using setTimeout.
 * This guarantees that the next execution only starts after the previous one has completed (or failed),
 * preventing request pile-ups.
 *
 * @param task The async function to execute.
 * @param intervalMs The delay in milliseconds before the next execution.
 * @returns A stop function that cancels any pending execution and prevents the
 *   loop from rescheduling. Safe to call multiple times. A task already in
 *   flight when `stop()` is called will still finish, but its completion will
 *   not trigger another iteration.
 */
export function startPolling(
  task: () => Promise<void>,
  intervalMs: number,
): () => void {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const runLoop = () => {
    if (stopped) return;
    task()
      .catch((error) => {
        log.error("Error in polling loop:", error);
      })
      .finally(() => {
        if (!stopped) {
          timeout = setTimeout(runLoop, intervalMs);
        }
      });
  };
  runLoop();

  return () => {
    stopped = true;
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };
}
