import { describe, it, test, expect } from "vitest";

import { visitor, createModel, Context } from "./model-store";

describe("GraphStore", () => {
  const ctx: Context = {
    getModelKeyProperty() {
      return "id";
    },
    store: {
      models: {},
      definitions: {},
    },
  };

  it("should create models", () => {
    const freeModel = Symbol();
    const model = createModel(
      { user: [{ id: 1 }], comment: { deep: [{ join: [{ id: 2 }] }] } },
      {
        schemaSymbol: freeModel,
        schema: {
          properties: {
            user: {
              items: {
                $ref: "/User",
              },
            },
          },
        },
      },
      ctx
    );

    console.log(model);
  });
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
