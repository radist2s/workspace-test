import fs from 'fs'
import path from 'path'

const packagePath = process.cwd();

async function createPackageFile() {
  const sourcePackageJsonPath = path.resolve(packagePath, './package.json');
  const sourcePackageData = await fs.promises.readFile(sourcePackageJsonPath, 'utf8');
  const {WORKSPACE_PACKAGE_DIST_FILES_USAGE_PATCH: workspacePackagePatchData, scripts, ...distPackageData} = JSON.parse(sourcePackageData);
  const distPackageJsonDir = path.join(packagePath, path.dirname(path.resolve(packagePath, workspacePackagePatchData.main)));
  const distPackageJsonPath = path.resolve(distPackageJsonDir, './package.json');
  await fs.promises.writeFile(distPackageJsonPath, JSON.stringify(distPackageData, null, 2), 'utf8');
  await fs.promises.writeFile(sourcePackageJsonPath, JSON.stringify({
    ...sourcePackageData,
    ...workspacePackagePatchData,
  }, null, 2), 'utf8')
}

createPackageFile()
