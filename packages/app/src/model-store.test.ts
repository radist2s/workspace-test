import { describe, it, test, expect } from "vitest";

import { visitor } from "./model-store";

describe("GraphStore", () => {
  it("should graph", () => {
    const res = visitor(
      {
        user: { id: 1 },
        nested: { last: { id: 22 } },
        posts: { first: [{ name: "one" }] },
      },
      {
        properties: {
          user: {
            $ref: "/User",
          },
          nested: {
            properties: {
              last: {
                $ref: "/Page",
              },
            },
          },
          posts: {
            properties: {
              first: {
                items: {
                  $ref: "/Post",
                },
              },
            },
          },
        },
      }
    );
    console.log(res);
    // expect(
    //
    // );
  });
});
