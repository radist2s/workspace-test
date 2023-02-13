import { JSONSchema4 } from "json-schema";
import { detailedDiff } from "deep-object-diff";

const modelKey = Symbol("NodeIdentifier");
type ModelKey = typeof modelKey;
type ModelSchemaSymbol = symbol;
type ModelUniqKey = string | number;

type ModelRelation = {
  [key in ModelKey]: [ModelSchemaSymbol, ModelUniqKey] | [ModelSchemaSymbol];
};

type ModelSchema<T> = T extends Array<infer ArrType>
  ? Array<ModelSchema<ArrType>>
  : T extends {}
  ? {
      [key in keyof T]?: T[key] extends Array<infer ModelArrType>
        ? Array<ModelSchema<ModelArrType>> | Array<ModelRelation>
        : ModelRelation | ModelSchema<T[key]>;
    }
  : never;

type Model<T> = {
  listeners?: Array<() => void>;
  name?: symbol | string;
  used?: Array<symbol | string>;
  snapshot: T;
  snapshotSchema:
    | ModelSchema<T>
    | ModelRelation
    | (ModelSchema<T> | ModelRelation)[]
    | null;
};

type SnapshotSchema<T, S> = T extends Array<infer ArrType>
  ? Array<SnapshotSchema<ArrType, S>>
  : T extends {}
  ? {
      [key in keyof T]?: T[key] extends Array<infer ModelArrType>
        ? Array<SnapshotSchema<ModelArrType, S>> | Array<ModelArrType>
        : S | SnapshotSchema<T[key], S>;
    }
  : never;

type User = { id: number };

let mU: Model<User> = {
  name: "user",
  used: ["conf"],
  snapshot: { id: 1 },
  snapshotSchema: {},
};

let m: Model<{
  foo: string;
  user: User;
  users: User[];
  inListUser: [{ first: { deep: User } }];
}> = {
  name: "conf",
  snapshot: {
    foo: "bar",
    user: { id: 1 },
    users: [{ id: 2 }],
    inListUser: [{ first: { deep: { id: 3 } } }],
  },
  snapshotSchema: {
    user: { [modelKey]: mU },
    users: [{ [modelKey]: mU }],
    inListUser: [{ first: { deep: { [modelKey]: mU } } }],
  },
};

export type Context = {
  store: {
    definitions: {
      [def: string]: JSONSchema4;
    };
    models: {
      [SchemaKey in symbol]:
        | { model: Model<any> }
        | {
            models: {
              [modelUniqKey in string | number]: Model<any>;
            };
          };
    };
  };
  getModelKeyProperty(schema: Pick<JSONSchema4, "$ref">): string;
};

export const createModel = <T>(
  data: T,
  { schema, schemaSymbol }: { schema: JSONSchema4; schemaSymbol?: symbol },
  ctx: Context
): Model<T> | null => {
  const { store, getModelKeyProperty } = ctx;

  if (!schema.$ref && !schemaSymbol)
    throw new Error(
      `Free schemas must define external Symbol, schema: ${JSON.stringify(
        schema
      )}`
    );

  const modelSchemaName = schema.id || schema.$ref;
  const modelSchemaSymbol = modelSchemaName
    ? Symbol.for(modelSchemaName)
    : schemaSymbol;

  if (!modelSchemaSymbol) throw new Error("No model symbol");

  if (schema.id) {
    store.definitions[schema.id] = {
      ...store.definitions[schema.id],
      ...schema,
    };
  } else if (schema.$ref) {
    const idProperty = getModelKeyProperty(schema);
    if (data && typeof data === "object" && idProperty in data) {
      const modelId = data[idProperty as keyof typeof data];

      if (!modelId || typeof modelId === "object") {
        throw new Error(
          `Can not find model id for schema ${JSON.stringify(schema)}`
        );
      }

      if (!(modelSchemaSymbol in store.models))
        store.models[modelSchemaSymbol] = { models: {} };

      const schemaModels = store.models[modelSchemaSymbol];

      const models = "models" in schemaModels ? schemaModels.models : undefined;

      let model: Model<typeof data> = models?.[
        modelId as keyof typeof models
      ] as Model<typeof data>;

      if (model) {
        const newSnapshotSchema = visitor(data, schema, {
          ...ctx,
          visitorCallback(schema, itemData, rootSchema) {
            const model = createModel(
              itemData,
              {
                schema,
              },
              ctx
            );
            const idProperty = getModelKeyProperty(schema);
            const modelId = model?.snapshot
              ? (model.snapshot[idProperty as keyof typeof model.snapshot] as
                  | string
                  | number)
              : undefined;

            if (!modelId)
              throw new Error(
                `No modelId for the schema ${JSON.stringify(schema)}`
              );

            if (model)
              return {
                [modelKey]: [Symbol.for(schema.$ref!), modelId],
              };
          },
        });

        // const difff = (
        //   snapshotSchema: Model<T>["snapshotSchema"],
        //   newSnapshotSchema: Model<T>["snapshotSchema"]
        // ) => {
        //   if (Array.isArray(snapshotSchema)) {
        //   } else if (snapshotSchema && typeof snapshotSchema === "object") {
        //     if (modelKey in snapshotSchema) {
        //     }
        //   }
        //
        //   // if (
        //   //   !existingModel.snapshot ||
        //   //   typeof existingModel.snapshot !== "object"
        //   // )
        //   //   return;
        //   // if (!newData || typeof newData !== "object") return;
        //   //
        //   // const diff = detailedDiff(existingModel.snapshot, newData);
        //   //
        //   // Object.entries(diff.deleted).forEach(([key, deleted]) => {});
        // };
      } else {
        model = {
          name: modelSchemaSymbol,
          snapshot: data,
          snapshotSchema: visitor(data, schema, {
            ...ctx,
            visitorCallback(schema, itemData, rootSchema) {
              const model = createModel(
                itemData,
                {
                  schema,
                },
                ctx
              );
              const idProperty = getModelKeyProperty(schema);
              const modelId = model?.snapshot
                ? (model.snapshot[idProperty as keyof typeof model.snapshot] as
                    | string
                    | number)
                : undefined;

              if (!modelId)
                throw new Error(
                  `No modelId for the schema ${JSON.stringify(schema)}`
                );

              if (model)
                return {
                  [modelKey]: [Symbol.for(schema.$ref!), modelId],
                };
            },
          }),
        };

        if (!(modelSchemaSymbol in store.models)) {
          store.models[modelSchemaSymbol] = { models: { [modelId]: model } };
        } else {
          store.models[modelSchemaSymbol][modelId] = model;
        }
      }

      return model;
    }
  } else if (
    schema.properties ||
    schema.items ||
    schema.anyOf ||
    schema.oneOf
  ) {
    const model: Model<typeof data> = {
      name: modelSchemaSymbol,
      snapshot: data,
      snapshotSchema: visitor(data, schema, {
        ...ctx,
        visitorCallback(schema, itemData, rootSchema) {
          const model = createModel(
            itemData,
            {
              schema,
            },
            ctx
          );

          const idProperty = getModelKeyProperty(schema);
          const modelId = model?.snapshot
            ? (model.snapshot[idProperty as keyof typeof model.snapshot] as
                | string
                | number)
            : undefined;

          if (!modelId)
            throw new Error(
              `No modelId for the schema ${JSON.stringify(schema)}`
            );

          if (model)
            return {
              [modelKey]: [Symbol.for(schema.$ref!), modelId],
            };
        },
      }),
    };

    if (modelSchemaSymbol in store.models) {
      throw new Error(
        "Free schema models must provide new Symbol for the new model"
      );
    }

    store.models[modelSchemaSymbol] = { model };

    return model;
  }

  return null;
};

const putModel = <T>(model: Model<T>, data: Partial<T>, ctx: Context) => {};

export const visitor = <T, S>(
  data: T,
  schema: JSONSchema4,
  ctx: Context & {
    visitorCallback(
      refSchema: JSONSchema4,
      data: unknown,
      rootSchema: JSONSchema4
    ): S | undefined;
  }
): SnapshotSchema<T, Model<any>> | null => {
  const strictTypeCheck = (check: boolean) => check || true;

  if (schema.$ref) {
    return null;
  }

  const visitorCallback = ctx.visitorCallback;

  if (schema.items && strictTypeCheck(schema.type === "array")) {
    if (!Array.isArray(data))
      throw new Error(
        `Inconsistency: provided data is ${JSON.stringify(
          JSON.stringify(data)
        )}, schema is ${JSON.stringify(schema)}`
      );

    let fields: SnapshotSchema<T, Model<any>>[] | undefined;

    const itemSchema = Array.isArray(schema.items)
      ? schema.items.find(
          ({ $ref, type }) => $ref || type === "object" || type === "array"
        )
      : schema.items;

    if (itemSchema) {
      data.forEach((itemData, itemDataIndex) => {
        if (itemSchema.$ref) {
          const result = visitorCallback(itemSchema, itemData, schema);
          if (result) {
            if (!fields) fields = [];
            fields[itemDataIndex] = result;
          }
        } else {
          const result = visitor(itemData, itemSchema, ctx);
          if (result) {
            if (!fields) fields = [];
            // @ts-ignore
            fields[itemDataIndex] = result;
          }
        }
      });
    }

    return fields ?? null;
  } else if (schema.properties && strictTypeCheck(schema.type === "object")) {
    if (!data || typeof data !== "object")
      throw new Error(
        `data must be an object for schema ${JSON.stringify(schema)}`
      );

    let fields: (ModelSchema<T> | ModelRelation<T>) | undefined;

    for (let propertyKey of Object.keys(schema.properties)) {
      const propertySchema = schema.properties[propertyKey];
      const propertyData =
        propertyKey in data
          ? data[propertyKey as keyof typeof data]
          : undefined;

      if (propertySchema.$ref) {
        if (!propertyData)
          throw new Error(
            `No data for the property "${propertyKey}" with schema ${JSON.stringify(
              schema
            )}`
          );

        let model = visitorCallback(propertySchema, propertyData, schema);

        if (model) {
          // @ts-ignore
          fields = { [propertyKey]: model, ...fields };
        }
      } else {
        const result = visitor(propertyData, propertySchema, ctx);
        if (result) {
          // @ts-ignore
          fields = { [propertyKey]: result, ...fields };
        }
      }
    }

    return fields ?? null;
  } else if (schema.oneOf || schema.anyOf) {
    const cases = schema.oneOf || schema.anyOf;
    const isNullable = cases?.find(({ type }) => type === "null");
    if (isNullable && data === null) return null;
    const refSchema = cases?.find(({ $ref }) => $ref);

    if (refSchema) {
      const model = visitorCallback(refSchema, data, schema);
      return model ?? null;
    }

    const oneOfSchema = cases?.find(({ type }) => {
      if (type === "array" && Array.isArray(data)) return true;
      if (type === "object" && data && typeof data === "object") return true;
    });

    if (oneOfSchema) {
      return visitor(data, oneOfSchema, ctx);
    }
  }

  return null;
};

type Store<T> = {
  models: Model<T>[];
  schemas: {};
};
