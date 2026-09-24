import { describe, expect, it } from "vitest";
import { crlaSexGroupedRows } from "../crlaReportShell";

type Row = { name: string; gender: string | null };

const render = (r: Row, n: number) => `<tr><td>${n}</td><td>${r.name}</td></tr>`;

describe("crlaSexGroupedRows", () => {
  it("lists MALE then FEMALE, each counted and numbered from 1", () => {
    const html = crlaSexGroupedRows<Row>(
      [
        { name: "ABAD", gender: "female" },
        { name: "BACO", gender: "male" },
        { name: "CRUZ", gender: "female" },
      ],
      (r) => r.gender,
      2,
      render,
    );
    expect(html).toBe(
      '<tr class="grp"><td colspan="2">MALE (1)</td></tr>' +
        "<tr><td>1</td><td>BACO</td></tr>" +
        '<tr class="grp"><td colspan="2">FEMALE (2)</td></tr>' +
        "<tr><td>1</td><td>ABAD</td></tr>" +
        "<tr><td>2</td><td>CRUZ</td></tr>",
    );
  });

  it("keeps both headings when a group is empty and adds UNSPECIFIED only when needed", () => {
    const html = crlaSexGroupedRows<Row>(
      [{ name: "DIAZ", gender: null }],
      (r) => r.gender,
      2,
      render,
    );
    expect(html).toContain("MALE (0)");
    expect(html).toContain("FEMALE (0)");
    expect(html).toContain("UNSPECIFIED (1)");
    expect(
      crlaSexGroupedRows<Row>([], (r) => r.gender, 2, render),
    ).not.toContain("UNSPECIFIED");
  });
});
