import fs from "fs";
import path from "path";

const packagePath = process.cwd();

export const getPackageJsonEndOfFile = (text) => {
  return text.slice(text.lastIndexOf("}") + 1, text.length);
};

class NoOutputStackError extends Error {}

export const objectDiff = (glob, matchGlob) => {
  const globDiffEntries = Object.entries(glob).reduce((acc, [key, value]) => {
    if (key in matchGlob) {
      if (matchGlob[key] === value) return acc;

      if (typeof matchGlob[key] === typeof value) {
        if (typeof value === "object") {
          const valueDiff = objectDiff(value, matchGlob[key]);
          if (Object.entries(valueDiff).length) {
            return [...acc, [key, valueDiff]];
          }
          return acc;
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

async function createDistPackageJson() {
  const sourcePackageJsonPath = path.resolve(packagePath, "./package.json");
  const packageJsonRaw = await fs.promises.readFile(
    sourcePackageJsonPath,
    "utf8"
  );

  const packageJsonFields = JSON.parse(packageJsonRaw);

  const {
    exports,
    packageJsonUtilsConfig,
    typesVersions,
    ...distPackageFields
  } = packageJsonFields;
  if (!packageJsonUtilsConfig?.distDir) {
    throw new NoOutputStackError(
      'package.json must contain "packageJsonUtilsConfig.distDir" field'
    );
  }

  const distPackageJsonDir = path.resolve(
    packagePath,
    packageJsonUtilsConfig.distDir
  );
  const distPackageJsonPath = path.resolve(
    distPackageJsonDir,
    "./package.json"
  );

  await fs.promises.writeFile(
    distPackageJsonPath,
    `${JSON.stringify(distPackageFields, null, 2)}${getPackageJsonEndOfFile(
      packageJsonRaw
    )}`,
    "utf8"
  );
}

async function getSourceIndexFiles(distDir, directoryIndexFiles) {
  const ignoreDir = path.resolve(packagePath, distDir);

  const readDirectoryIndexFiles = async (targetDir, baseDir) => {
    return Promise.all(
      (await fs.promises.readdir(targetDir, { withFileTypes: true })).map(
        async (dirent) => {
          const direntPath = path.join(targetDir, dirent.name);
          if (ignoreDir === direntPath) {
            return null;
          }

          if (dirent.isDirectory()) {
            return readDirectoryIndexFiles(direntPath, baseDir);
          }

          if (!directoryIndexFiles.includes(dirent.name)) {
            return null;
          }

          return path.relative(baseDir, direntPath);
        }
      )
    ).then((list) => list.flat().filter(Boolean));
  };

  return readDirectoryIndexFiles(packagePath, packagePath);
}

async function generateModuleDistExports(distDir, indexFileList) {
  const distDirFullPath = path.resolve(packagePath, distDir);
  const distDirRelativePath = path.relative(
    path.dirname(distDirFullPath),
    distDirFullPath
  );

  const indexFiles = indexFileList.reduce((acc, filePath) => {
    const fileName = filePath.split(path.sep).at(-1);
    const fileDir = path.dirname(filePath);
    const distFileName =
      fileName === "index.ts" || fileName === "index.tsx"
        ? "index.js"
        : fileName;

    return {
      ...acc,
      [`./${fileDir}`]: `./${distDirRelativePath}/${fileDir}/${distFileName}`,
    };
  }, {});

  return {
    ...indexFiles,
    "./*": `./${distDirRelativePath}/*`,
    "./package.json": "./package.json",
  };
}

async function generateModuleDistTypesVersions(distDir, indexFileList) {
  const distDirFullPath = path.resolve(packagePath, distDir);
  const distDirRelativePath = path.relative(
    path.dirname(distDirFullPath),
    distDirFullPath
  );

  const indexFiles = indexFileList.reduce((acc, filePath) => {
    const fileName = filePath.split(path.sep).at(-1);

    if (
      fileName !== "index.tsx" &&
      fileName !== "index.ts" &&
      fileName !== "index.d.ts"
    ) {
      return acc;
    }

    const fileDir = path.dirname(filePath);
    return {
      ...acc,
      [`${fileDir}`]: [`${distDirRelativePath}/${fileDir}/index.d.ts`],
    };
  }, {});

  return {
    ">=3.1": {
      "*": ["./dist/*"],
      ...indexFiles,
    },
  };
}

async function patchPackageJsonDistExports() {
  const packageJsonPath = path.resolve(packagePath, "./package.json");
  const packageJsonRaw = await fs.promises.readFile(packageJsonPath, "utf8");
  const packageJsonFields = JSON.parse(packageJsonRaw);
  const { packageJsonUtilsConfig } = packageJsonFields;
  if (!packageJsonUtilsConfig?.distDir) {
    throw new NoOutputStackError(
      'package.json must contain "packageJsonUtilsConfig.distDir" field'
    );
  }

  if (!Array.isArray(packageJsonUtilsConfig.directoryIndexFiles)) {
    throw new NoOutputStackError(
      'package.json must contain "packageJsonUtilsConfig.directoryIndexFiles" array field'
    );
  }

  const indexFiles = await getSourceIndexFiles(
    packageJsonUtilsConfig.distDir,
    packageJsonUtilsConfig.directoryIndexFiles
  );

  const { exports, typesVersions } = {
    typesVersions: await generateModuleDistTypesVersions(
      packageJsonUtilsConfig.distDir,
      indexFiles
    ),
    exports: await generateModuleDistExports(
      packageJsonUtilsConfig.distDir,
      indexFiles
    ),
  };

  const hasChanges = Boolean(
    Object.keys(
      objectDiff(
        {
          exports,
          typesVersions,
        },
        packageJsonFields
      )
    ).length
  );

  if (!hasChanges) return;

  await fs.promises.writeFile(
    packageJsonPath,
    `${JSON.stringify(
      {
        ...packageJsonFields,
        exports,
        typesVersions,
      },
      null,
      2
    )}${getPackageJsonEndOfFile(packageJsonRaw)}`,
    "utf8"
  );
}

async function revertPackageJsonDistFields() {
  const packageJsonPath = path.resolve(packagePath, "./package.json");
  const packageJsonRaw = await fs.promises.readFile(packageJsonPath, "utf8");
  const { exports, typesVersions, ...revertedPackageJsonFields } =
    JSON.parse(packageJsonRaw);

  if (!exports && !typesVersions) {
    console.log("Skipped: package.json has no dist fields");
    return;
  }

  await fs.promises.writeFile(
    packageJsonPath,
    `${JSON.stringify(
      revertedPackageJsonFields,
      null,
      2
    )}${getPackageJsonEndOfFile(packageJsonRaw)}`,
    "utf8"
  );

  const noColor = "\x1B[0m";
  const greenColor = "\x1B[32m";

  console.log(
    `${greenColor}package.json dist fields have been reverted${noColor}`
  );
}

async function detectPackageJsonDistExportsField(packageJsonRaw) {
  const packageFields = JSON.parse(packageJsonRaw);

  const packageJsonAbandonedFields = ["exports", "typesVersions"].reduce(
    (acc, distExportsField) => {
      if (distExportsField in packageFields) {
        return [...acc, [distExportsField, packageFields[distExportsField]]];
      }
      return acc;
    },
    []
  );

  if (packageJsonAbandonedFields.length) {
    throw new NoOutputStackError(
      `"${
        packageFields.name
      }" package must not contain fields:\n${JSON.stringify(
        Object.fromEntries(packageJsonAbandonedFields),
        null,
        2
      )}`
    );
  }
}

function errorHandler(error) {
  const noColor = "\x1B[0m";
  const redColor = "\x1B[31m";

  if (error instanceof NoOutputStackError) {
    console.error(`${redColor}${error.message}${noColor}`);
  } else {
    console.error(redColor, error, noColor);
  }

  process.exit(1);
}

async function run() {
  try {
    if (process.argv.includes("--create-dist")) {
      await createDistPackageJson();
    }
    if (process.argv.includes("--patch-dist-exports")) {
      await patchPackageJsonDistExports();
    }

    if (process.argv.includes("--revert-dist-exports")) {
      await revertPackageJsonDistFields();
    }
  } catch (error) {
    errorHandler(error);
  }

  if (process.argv.includes("--validate-input-package-json")) {
    const { stdin } = process;
    let inputData = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      inputData += chunk;
    });
    stdin.on("end", async () => {
      if (!inputData) throw new NoOutputStackError("StdIN data is empty");
      try {
        await detectPackageJsonDistExportsField(inputData);
      } catch (error) {
        errorHandler(error);
      }
    });
    stdin.on("error", (error) => {
      errorHandler(error);
    });
  }
}

run();
