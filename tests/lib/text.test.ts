import { describe, expect, it } from "vitest";
import { decodeEntities, stripHtml } from "../../convex/lib/text";

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("A &amp; B &lt;3 &#39;x&#x27;&nbsp;!")).toBe("A & B <3 'x' !");
  });
  it("leaves unknown or out-of-range entities alone", () => {
    expect(decodeEntities("&bogus; &#99999999;")).toBe("&bogus; &#99999999;");
  });
});

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Air&nbsp;quality <b>daily</b></p>\n<br/>data")).toBe("Air quality daily data");
  });
});
