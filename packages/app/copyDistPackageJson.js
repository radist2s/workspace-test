import fs from "fs";
import path from "path";

const packagePath = process.cwd();

export const getPackageJsonEndOfFile = (text) => {
  return text.slice(text.lastIndexOf("}") + 1, text.length);
};

async function createDistPackageJson() {
  const sourcePackageJsonPath = path.resolve(packagePath, "./package.json");
  const packageJsonRaw = await fs.promises.readFile(
    sourcePackageJsonPath,
    "utf8"
  );
  const packageJsonFields = JSON.parse(packageJsonRaw);

  const {
    WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH: packageDistExportsFieldsPatch,
    ...packageFields
  } = packageJsonFields;
  if (!packageDistExportsFieldsPatch?.main) {
    throw new Error(
      'package.json should contain "WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH.main" field'
    );
  }
  const distPackageJsonDir = path.dirname(
    path.resolve(packagePath, packageDistExportsFieldsPatch.main)
  );

  const distPackageJsonPath = path.resolve(
    distPackageJsonDir,
    "./package.json"
  );
  const distPackageFields = objectDiff(
    packageFields,
    packageDistExportsFieldsPatch
  );
  await fs.promises.writeFile(
    distPackageJsonPath,
    `${JSON.stringify(distPackageFields, null, 2)}${getPackageJsonEndOfFile(
      packageJsonRaw
    )}`,
    "utf8"
  );
}

async function patchPackageJsonDistExports() {
  const packageJsonPath = path.resolve(packagePath, "./package.json");
  const packageJsonRaw = await fs.promises.readFile(packageJsonPath, "utf8");
  const packageJsonFields = JSON.parse(packageJsonRaw);
  const {
    WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH: workspacePackagePatchFields,
  } = packageJsonFields;
  if (!workspacePackagePatchFields?.main) {
    throw new Error(
      'package.json should contain "WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH.main" field'
    );
  }
  await fs.promises.writeFile(
    packageJsonPath,
    `${JSON.stringify(
      {
        ...packageJsonFields,
        ...workspacePackagePatchFields,
      },
      null,
      2
    )}${getPackageJsonEndOfFile(packageJsonRaw)}`,
    "utf8"
  );
}

async function removeDistPackage() {
  const sourcePackageJsonPath = path.resolve(packagePath, "./package.json");
  const sourcePackageFields = JSON.parse(
    await fs.promises.readFile(sourcePackageJsonPath, "utf8")
  );
  const {
    WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH: workspacePackagePatchFields,
  } = sourcePackageFields;
  if (!workspacePackagePatchFields?.main) {
    throw new Error(
      'package.json should contain "WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH.main" field'
    );
  }
  const distPackageDir = path.dirname(
    path.resolve(packagePath, workspacePackagePatchFields.main)
  );
  await rimraf(distPackageDir);
}

export const objectDiff = (glob, matchGlob) => {
  const foo = (globValue, matchGlobValue) => {
    if (typeof globValue === matchGlobValue) {
      if (Array.isArray(globValue)) {
        if (Array.isArray(matchGlobValue)) {
          if (
            globValue.every((valueItem, valueItemIndex) => {
              return foo(valueItem, matchGlobValue[valueItemIndex]);
            })
          )
            return acc;
        }
      } else if (typeof value === "object") {
        const valueDiff = objectDiff(value, matchGlob[key]);
        if (Object.entries(valueDiff).length) {
          return [...acc, [key, valueDiff]];
        } else {
          return acc;
        }
      }
    }
  };

  const globDiffEntries = Object.entries(glob).reduce((acc, [key, value]) => {
    if (key in matchGlob) {
      if (matchGlob[key] === value) return acc;

      if (typeof matchGlob[key] === typeof value) {
        if (typeof value === "object") {
          const valueDiff = objectDiff(value, matchGlob[key]);
          if (Object.entries(valueDiff).length) {
            return [...acc, [key, valueDiff]];
          } else {
            return acc;
          }
        }
      }
    }

    return [...acc, [key, value]];
  }, []);

  const globDiff = Object.fromEntries(globDiffEntries);

  if (Array.isArray(glob)) {
    return Object.values(globDiff);
  }

  return globDiff;
};

async function revertPackageJsonDistExportsFields() {
  const packageJsonPath = path.resolve(packagePath, "./package.json");
  const packageJsonRaw = await fs.promises.readFile(packageJsonPath, "utf8");
  const packageFields = JSON.parse(packageJsonRaw);
  const {
    WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH: packageDistExportsFieldsPatch,
  } = packageFields;
  if (
    !packageDistExportsFieldsPatch ||
    typeof packageDistExportsFieldsPatch !== "object"
  ) {
    throw new Error(
      'package.json should contain "WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH" field object'
    );
  }

  const revertedPackageJsonFields = objectDiff(
    packageFields,
    packageDistExportsFieldsPatch
  );

  await fs.promises.writeFile(
    packageJsonPath,
    `${JSON.stringify(
      revertedPackageJsonFields,
      null,
      2
    )}${getPackageJsonEndOfFile(packageJsonRaw)}`,
    "utf8"
  );
}

async function run() {
  if (process.argv.includes("--create-dist")) {
    await createDistPackageJson();
  }
  if (process.argv.includes("--patch-dist")) {
    await patchPackageJsonDistExports();
  }

  if (
    process.argv.includes("--revert-dist-patch") ||
    process.argv.includes("--clean")
  ) {
    await revertPackageJsonDistExportsFields();
  }

  if (process.argv.includes("--clean")) {
    await removeDistPackage();
  }
}

run();
