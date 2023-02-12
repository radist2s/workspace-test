import { JSONSchema4 } from "json-schema";

const modelKey = Symbol();
type ModelKey = typeof modelKey;

type ModelRef<T> = { [key in ModelKey]: Model<T> };

type ModelSchema<T> = T extends Array<infer ArrType>
  ? Array<ModelSchema<ArrType>>
  : T extends {}
  ? {
      [key in keyof T]?: T[key] extends Array<infer ModelArrType>
        ? Array<ModelSchema<ModelArrType>> | Array<ModelRef<ModelArrType>>
        : ModelRef<T[key]> | ModelSchema<T[key]>;
    }
  : never;

type Model<T> = {
  listeners?: Array<() => void>;
  name?: symbol | string;
  used?: Array<symbol | string>;
  snapshot: T;
  snapshotSchema:
    | ModelSchema<T>
    | ModelRef<T>
    | (ModelSchema<T> | ModelRef<T>)[]
    | null;
};

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

type Context = {
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
    subscribe: (callback: (path: any) => void) => () => void;
  };
  getModelKeyProperty(schema: Pick<JSONSchema4, "$ref">): string;
};

const createModel = <T>(
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
  }

  if (schema.$ref) {
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
          rootModel: model,
        });
      } else {
        model = {
          name: modelSchemaSymbol,
          snapshot: data,
          snapshotSchema: visitor(data, schema, {
            ...ctx,
            subscribe: store.subscribe,
          }),
        };
      }

      const notifier = subscribe(() => {
        if (!model.listeners) return;
        const listenerIndex = model.listeners.indexOf(notifier);
        if (listenerIndex === -1) return;
        model.listeners.splice(listenerIndex, 1);
      });

      if (!model.listeners) model.listeners = [];
      model.listeners.push(notifier);

      if (!("model" in schemaModels)) {
        if (!schemaModels.models) schemaModels.models = {};
        schemaModels.models[modelId as keyof (typeof schemaModels)["models"]] =
          model;
      }

      return model;
    }
  } else if (
    schema.type === "object" ||
    schema.type === "array" ||
    schema.anyOf ||
    schema.oneOf
  ) {
    const model: Model<typeof data> = {
      name: modelSchemaSymbol,
      snapshot: data,
      snapshotSchema: visitor(data, schema, {
        ...ctx,
        subscribe: store.subscribe,
      }),
    };

    const notifier = subscribe(() => {
      if (!model.listeners) return;
      const listenerIndex = model.listeners.indexOf(notifier);
      if (listenerIndex === -1) return;
      model.listeners.splice(listenerIndex, 1);
    });

    if (!model.listeners) model.listeners = [];
    model.listeners.push(notifier);

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

export const visitor = <T>(
  data: T,
  schema: JSONSchema4,
  ctx: Context & { rootModel: Model<any> }
): ModelSchema<T> | ModelRef<T> | (ModelSchema<T> | ModelRef<T>)[] | null => {
  const strictTypeCheck = (check: boolean) => check || true;

  if (schema.$ref) {
    return null;
  }

  if (schema.items && strictTypeCheck(schema.type === "array")) {
    if (!Array.isArray(data))
      throw new Error(
        `Inconsistency: provided data is ${JSON.stringify(
          JSON.stringify(data)
        )}, schema is ${JSON.stringify(schema)}`
      );

    let fields: (ModelSchema<T> | ModelRef<T>)[] | undefined;

    const itemSchema = Array.isArray(schema.items)
      ? schema.items.find(
          ({ $ref, type }) => $ref || type === "object" || type === "array"
        )
      : schema.items;

    if (itemSchema) {
      data.forEach((itemData, itemDataIndex) => {
        if (itemSchema.$ref) {
          if (!fields) fields = [];
          const model = createModel(
            itemData,
            {
              schema: { $ref: itemSchema.$ref },
            },
            ctx
          );
          if (model)
            fields[itemDataIndex] = {
              [modelKey]: model,
            };
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

    let fields: (ModelSchema<T> | ModelRef<T>) | undefined;

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

        const model = createModel(
          propertyData,
          {
            schema: { $ref: propertySchema.$ref },
          },
          ctx
        );
        if (model) {
          const modelSchema = {
            [modelKey]: model,
          };

          // @ts-ignore
          fields = { [propertyKey]: modelSchema, ...fields };
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
    const $ref = cases?.find(({ $ref }) => $ref)?.$ref;

    if ($ref) {
      const model = createModel(
        data,
        {
          schema: { $ref },
        },
        ctx
      );
      if (!model) return null;
      return {
        [modelKey]: model,
      };
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
