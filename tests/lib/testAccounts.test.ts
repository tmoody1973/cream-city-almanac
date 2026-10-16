import { describe, expect, it } from "vitest";
import { accountLimit } from "../../convex/lib/testAccounts";

const env = { TEST_ACCOUNTS: " Tester@Example.com , other@example.com" };

describe("per-account limits for the shared test account", () => {
  it("gives a listed, verified account the test limit, matching email case-insensitively", () => {
    expect(accountLimit("askCity", { email: "tester@example.com", emailVerified: true }, env)).toBe("askCityTest");
    expect(accountLimit("askTracts", { email: "OTHER@example.com", emailVerified: true }, env)).toBe("askTractsTest");
  });
  it("keeps everyone else, unverified emails and deployments without the setting on the normal limit", () => {
    expect(accountLimit("askCity", { email: "someone@radiomilwaukee.org", emailVerified: true }, env)).toBe("askCity");
    expect(accountLimit("askCity", { email: "tester@example.com", emailVerified: false }, env)).toBe("askCity");
    expect(accountLimit("askCity", { email: "tester@example.com" }, env)).toBe("askCity");
    expect(accountLimit("askCity", { email: "tester@example.com", emailVerified: true }, {})).toBe("askCity");
    expect(accountLimit("askTracts", {}, env)).toBe("askTracts");
  });
});
