// ponytail: races fetch against a timer rather than aborting it; the abandoned request is simply ignored. Swap for AbortSignal.timeout once confirmed in the Convex runtime.
export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s: ${url}`)), ms);
  });
  try {
    return await Promise.race([fetch(url, init), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
