const WRITE_CONFLICT = /changed while this mutation was being run/;
const DEFAULT_ATTEMPTS = 5;
const BASE_WAIT_MS = 500;
const JITTER_MS = 2000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Every build item reports to one shared `builds` row. When Convex's own retries lose that write race, the item's
// action would throw and the build would never finish, so try again after a random pause. Other errors fail at once.
export async function retryOnConflict<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; wait?: (attempt: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const wait = opts.wait ?? ((attempt: number) => sleep(BASE_WAIT_MS + Math.random() * JITTER_MS * attempt));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts || !(e instanceof Error && WRITE_CONFLICT.test(e.message))) throw e;
      await wait(attempt);
    }
  }
}
