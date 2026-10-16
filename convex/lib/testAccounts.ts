// The shared end-to-end test account runs the whole browser suite, several times an hour across PRs, and drains the
// per-account limits a person never would. Accounts listed (verified email) in the deployment's TEST_ACCOUNTS get the
// higher test variant. Set it on dev only (local runs and previews); production never has it, so its limits never change.
type Limited = "askCity" | "askTracts";

export function accountLimit(
  name: Limited,
  identity: { email?: string; emailVerified?: boolean },
  env: Record<string, string | undefined> = process.env,
): Limited | `${Limited}Test` {
  const listed = (env.TEST_ACCOUNTS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = identity.email?.toLowerCase();
  return identity.emailVerified === true && email && listed.includes(email) ? `${name}Test` : name;
}
