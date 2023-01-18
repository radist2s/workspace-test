import { describe, it, test, expect } from "vitest";
import { objectDiff, getPackageJsonEndOfFile } from "./copyDistPackageJson";

describe("objectDiff", () => {
  it("should return empty object diff", () => {
    expect(
      objectDiff(
        {
          a: true,
          b: "foo",
          c: [1, 2, 3],
        },
        {
          a: true,
          b: "foo",
          c: [1, 2, 3],
        }
      )
    ).eql({});
  });

  it("should return empty array diff", () => {
    expect(
      objectDiff(
        [
          {
            a: true,
            b: "foo",
            c: [1, 2, 3],
          },
        ],
        [
          {
            a: true,
            b: "foo",
            c: [1, 2, 3],
          },
        ]
      )
    ).eql([]);
  });

  it("should return array diff", () => {
    expect(
      objectDiff(
        [
          {
            a: true,
            b: "foo",
            c: [1, 2, 3, 4],
          },
          { b: { c: 1 } },
        ],
        [
          {
            a: true,
            b: "foo",
            c: [1, 2, 3],
          },
          { b: { c: 2 } },
        ]
      )
    ).eql([{ c: [4] }, { b: { c: 1 } }]);
  });

  it("should return object diff", () => {
    expect(
      objectDiff(
        {
          a: true,
          b: "foo",
          c: [1, 2, 3, 4],
        },
        {
          a: true,
          b: "foo",
          c: [1, 2, 3],
        }
      )
    ).eql({ c: [4] });
  });
});

describe("getPackageJsonEndOfFile", () => {
  it("returns any amount of trailing line breaks", () => {
    expect(getPackageJsonEndOfFile('{"foo":"bar"}\n\n\n')).eq("\n\n\n");
    expect(getPackageJsonEndOfFile('{"foo":"bar"}\n')).eq("\n");
  });
  it("returns any amount of trailing spaces and line breaks", () => {
    expect(getPackageJsonEndOfFile('{"foo":"bar"}\n \n \n')).eq("\n \n \n");
    expect(getPackageJsonEndOfFile('{"foo":"bar"}\n ')).eq("\n ");
    expect(getPackageJsonEndOfFile('{"foo":"bar"} ')).eq(" ");
  });
});
