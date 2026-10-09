// The guide's live sample: the same lookup Ask makes for "kids under 5 in poverty in Harambee" (public, no AI call).
export const SAMPLE_QUESTION = "How many kids under 5 live in poverty in Harambee?";
export const SAMPLE_ARGS = { neighborhood: "Harambee", topic: "Poverty Status by Age", row: "Under 5 years" };

export async function loadSample<T extends { status: string }>(fetch: (args: typeof SAMPLE_ARGS) => Promise<T>): Promise<T | null> {
  try {
    const r = await fetch(SAMPLE_ARGS);
    return r.status === "ok" ? r : null;
  } catch {
    return null;
  }
}
