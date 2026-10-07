import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "../../convex/lib/xlsx";

function workbook(): Uint8Array {
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<workbook><sheets><sheet name="Home" sheetId="1" r:id="rId1"/><sheet name="O&apos;Brien Tab" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>Dataset A</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>`),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2"><v>42</v></c></row>` +
        `<row r="3"><c r="B3" t="inlineStr"><is><t>inline &amp; more</t></is></c><c r="A3" t="s"><v>1</v></c><c r="D3" s="1"/></row></sheetData>` +
        `<hyperlinks><hyperlink ref="A2" location="'O''Brien Tab'!A1"/><hyperlink ref="A3" r:id="rId9"/></hyperlinks></worksheet>`,
    ),
    "xl/worksheets/sheet2.xml": strToU8(`<worksheet><sheetData/></worksheet>`),
  });
}

describe("readWorkbook", () => {
  const sheets = readWorkbook(workbook());

  it("reads sheet names in order, decoding entities", () => {
    expect(sheets.map((s) => s.name)).toEqual(["Home", "O'Brien Tab"]);
  });

  it("reads shared, rich, inline and numeric cells into a dense grid", () => {
    const rows = sheets[0].rows;
    expect(rows[0]).toEqual([]);
    expect(rows[1]).toEqual(["Dataset A", "", "42"]);
    expect(rows[2]).toEqual(["Rich text", "inline & more", "", ""]);
  });

  it("reads internal hyperlinks and ignores external ones", () => {
    expect(sheets[0].links).toEqual([{ row: 2, target: "O'Brien Tab" }]);
  });

  it("handles an empty sheet", () => {
    expect(sheets[1].rows).toEqual([]);
  });
});
