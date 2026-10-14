import { describe, expect, it } from "vitest";
import { checked, ELECTIONS, readReport, readSheet, readTableRows, sourceFile, tableSql, turnoutColumns, wardOf } from "../../convex/lib/turnout";

const e = (key: string) => ELECTIONS.find((x) => x.key === key)!;

describe("ELECTIONS (K4)", () => {
  it("lists the 12 elections, oldest first, on the right maps", () => {
    expect(ELECTIONS.map((x) => x.key)).toEqual(["2016-04", "2016-11", "2017-02", "2018-04", "2018-08", "2018-11", "2019-04", "2020-02", "2020-04", "2020-11", "2021-04", "2022-08"]);
    expect(e("2022-08")).toMatchObject({ map: "2022", wards: 354, reader: "sheet", type: "primary" });
    expect(e("2020-11")).toMatchObject({ map: "2012", wards: 327, reader: "report", type: "general" });
  });
});

describe("turnoutColumns (K4)", () => {
  it("finds ward, registered and ballots in every spelling seen live, never blank or party ballots", () => {
    const sets = [
      ["Ward", "REGISTERED VOTERS - TOTAL", "BALLOTS CAST - TOTAL", "BALLOTS CAST - Republican", "BALLOTS CAST - BLANK"],
      ["Ward", "Registered Voters Total", "Ballots Cast Total", "Ballots Cast Blank", "Voter Turnout Percent"],
      ["Ward", "Registered Voters", "Ballots Cast-Total", "Ballots Cast-Democratic", "Ballots Cast Crossover"],
      ["Ward", "Registered Voters -Total", "Ballots Cast - Total", "Ballots Cast - Blank"],
      ["Ward", "Registered Voters", "Ballots Cast", "Blank", "Voter Turnout"],
      ["Municipality", "Ward No.", "Registered Voters (Total)", "Ballots Cast (Total)", "Republican Cast", "Blank Cast"],
    ];
    for (const h of sets) {
      const c = turnoutColumns(h);
      expect(c.ok).toBe(true);
      if (c.ok) expect([/^ward/i.test(c.ward), /^registered/i.test(c.registered), /^ballots cast[ -]*(total|\(total\))?$/i.test(c.ballots)]).toEqual([true, true, true]);
    }
    expect(turnoutColumns(["Ward", "Registered Voters", "Ballots Cast - Blank"])).toEqual({ ok: false, missing: "ballots cast" });
  });
});

describe("wardOf (K4)", () => {
  it("reads ward cells and spots totals", () => {
    expect([wardOf("1"), wardOf("Ward 1"), wardOf("01"), wardOf(1), wardOf(" Ward 354 "), wardOf("Total"), wardOf("Ward No."), wardOf(""), wardOf("Ward 1A")]).toEqual([1, 1, 1, 1, 354, "total", null, null, null]);
  });
});

describe("readers (K4)", () => {
  it("builds a table query that casts numbers to text, on a checked id", () => {
    expect(tableSql("feffd844-d2ef-4c4d-aa03-c474c5364455", { ward: "Ward", registered: "Registered Voters Total", ballots: "Ballots Cast Total" }))
      .toBe(`SELECT "Ward"::text AS ward, "Registered Voters Total"::text AS reg, "Ballots Cast Total"::text AS bal FROM "feffd844-d2ef-4c4d-aa03-c474c5364455"`);
    expect(() => tableSql("x", { ward: "Ward", registered: "R", ballots: "B" })).toThrow("Not a CKAN resource id");
  });
  it("reads table rows with commas and a total row; a duplicate ward fails (review focus 1)", () => {
    expect(readTableRows([{ ward: "1", reg: "1,435", bal: "257" }, { ward: "Ward 2", reg: "554", bal: "25" }, { ward: "Total", reg: "1989", bal: "282" }]))
      .toEqual({ ok: true, wards: [{ ward: 1, registered: 1435, ballots: 257 }, { ward: 2, registered: 554, ballots: 25 }], total: { registered: 1989, ballots: 282 } });
    expect(readTableRows([{ ward: "1", reg: "10", bal: "5" }, { ward: "1", reg: "10", bal: "5" }])).toEqual({ ok: false, why: "ward 1 is listed twice" });
    expect(readTableRows([{ ward: "1", reg: "ten", bal: "5" }])).toEqual({ ok: false, why: "ward 1 has an unreadable number" });
  });
  it("reads a sheet below its summary block, using the block's totals", () => {
    const rows = [
      ["General Turnout", "", ""], ["", "", "VOTES", "PERCENT (%)", "", "", "", "VOTES"],
      ["Ballots Cast- Rep.", "", "13", "0.1", "", "Ballots Cast- Total", "", "30"],
      ["Ballots Cast- Dem.", "", "17", "0.9", "", "Registered Voters- Total", "", "300"],
      ["", "", "", ""],
      ["Municipality", "Ward No.", "Registered Voters (Total)", "Ballots Cast (Total)", "Republican Cast", "Blank Cast"],
      ["City of Milwaukee", "Ward 1", "100", "10", "4", "0"], ["City of Milwaukee", "Ward 2", "200", "20", "9", "0"],
    ];
    expect(readSheet(rows)).toEqual({ ok: true, wards: [{ ward: 1, registered: 100, ballots: 10 }, { ward: 2, registered: 200, ballots: 20 }], total: { registered: 300, ballots: 30 } });
    expect(readSheet([["Municipalitiy", "Ward No.", "Registered Voters- Total", "Ballots Cast- Total"], ["City of Milwaukee", "Ward 1", "5", "2"], ["Total", "", "5", "2"]]))
      .toEqual({ ok: true, wards: [{ ward: 1, registered: 5, ballots: 2 }], total: { registered: 5, ballots: 2 } });
    expect(readSheet([["Ward", "Registered", "Votes"]])).toEqual({ ok: false, why: "no ward table with registered voters and ballots cast" });
  });
  it("reads the printed report's ward lines and its stated totals", () => {
    const text = [
      " CITY OF MILWAUKEE,,,,,,,,,,", "2020 GENERAL ELECTION,,,,,,,,,,",
      '01 = REGISTERED VOTERS - TOTAL                         ,,,,,,"2,026",,,,', '02 = BALLOTS CAST - TOTAL                                ,,,,,,"1,543",,,,',
      ",,Ward,1,2,3,4,,,,", "1,City of Milwaukee Ward,1,1502,1185,0,78.89,,,,", "2,City of Milwaukee Ward,2,524,358,1,68.32,,,,",
      ",,,,,,,,,,", "PRESIDENT AND VICE PRESIDENT,,,,", ",,Ward,1,2,3,4,5,6,7,8", "1,City of Milwaukee Ward,1,974,190,5,5,2,6,1,2", // a race block: ignored
    ].join("\n");
    expect(readReport(text)).toEqual({ ok: true, wards: [{ ward: 1, registered: 1502, ballots: 1185 }, { ward: 2, registered: 524, ballots: 358 }], total: { registered: 2026, ballots: 1543 } });
  });
});

describe("checked (K4)", () => {
  it("passes matching totals, fails a mismatch, and marks too few wards partial", () => {
    const wards = [{ ward: 1, registered: 100, ballots: 10 }, { ward: 2, registered: 200, ballots: 20 }];
    expect(checked(e("2016-11"), { ok: true, wards, total: { registered: 300, ballots: 30 } })).toEqual({ ok: true, wards, partial: true, count: 2 });
    expect(checked(e("2016-11"), { ok: true, wards, total: { registered: 301, ballots: 30 } })).toEqual({ ok: false, why: "wards add up to 300 registered and 30 ballots; the file's total says 301 and 30" });
    expect(checked(e("2016-11"), { ok: false, why: "x" })).toEqual({ ok: false, why: "x" });
  });
});

describe("sourceFile (K4)", () => {
  it("finds the election's file by member title and file name, with the id from its link", () => {
    const link = (rid: string, f: string) => `https://data.milwaukee.gov/dataset/p/resource/${rid}/download/${f}`;
    const members = [
      { title: "2018 Nov 6, Governor", files: [{ name: "CSV", format: "CSV", url: link("11111111-1111-1111-1111-111111111111", "g.csv") }] },
      { title: "2018 Nov 6, Voter Turnout", files: [{ name: "CSV", format: "CSV", url: link("78a5a6f6-78cc-4c12-ae8a-86ec4259ffc0", "t.csv") }] },
    ];
    expect(sourceFile(e("2018-11"), members)).toEqual({ url: link("78a5a6f6-78cc-4c12-ae8a-86ec4259ffc0", "t.csv"), resourceId: "78a5a6f6-78cc-4c12-ae8a-86ec4259ffc0" });
    expect(sourceFile(e("2016-11"), members)).toBeNull();
  });
});
