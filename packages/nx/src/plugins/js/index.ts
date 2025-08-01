import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';
import { ProjectGraph } from '../../config/project-graph';
import { hashArray } from '../../hasher/file-hasher';
import {
  CreateDependencies,
  CreateDependenciesContext,
  CreateNodes,
  createNodesFromFiles,
  CreateNodesV2,
} from '../../project-graph/plugins';
import { RawProjectGraphDependency } from '../../project-graph/project-graph-builder';
import { workspaceDataDirectory } from '../../utils/cache-directory';
import { combineGlobPatterns } from '../../utils/globs';
import { detectPackageManager } from '../../utils/package-manager';
import { nxVersion } from '../../utils/versions';
import { workspaceRoot } from '../../utils/workspace-root';
import { readBunLockFile } from './lock-file/bun-parser';
import {
  getLockFileDependencies,
  getLockFileName,
  getLockFileNodes,
  lockFileExists,
  LOCKFILES,
} from './lock-file/lock-file';
import { buildExplicitDependencies } from './project-graph/build-dependencies/build-dependencies';
import { jsPluginConfig } from './utils/config';

export const name = 'nx/js/dependencies-and-lockfile';

interface ParsedLockFile {
  externalNodes?: ProjectGraph['externalNodes'];
  dependencies?: RawProjectGraphDependency[];
}

let parsedLockFile: ParsedLockFile = {};

export const createNodesV2: CreateNodesV2 = [
  combineGlobPatterns(LOCKFILES),
  (files, _, context) => {
    return createNodesFromFiles(createNodes[1], files, _, context);
  },
];

export const createNodes: CreateNodes = [
  // Look for all lockfiles
  combineGlobPatterns(LOCKFILES),
  (lockFile, _, context) => {
    const pluginConfig = jsPluginConfig(context.nxJsonConfiguration);
    if (!pluginConfig.analyzeLockfile) {
      return {};
    }

    const packageManager = detectPackageManager(workspaceRoot);

    // Only process the correct lockfile
    if (lockFile !== getLockFileName(packageManager)) {
      return {};
    }

    const lockFilePath = join(workspaceRoot, lockFile);
    const lockFileContents =
      packageManager !== 'bun'
        ? readFileSync(lockFilePath, 'utf-8')
        : readBunLockFile(lockFilePath);
    const lockFileHash = getLockFileHash(lockFileContents);

    if (!lockFileNeedsReprocessing(lockFileHash)) {
      const nodes = readCachedParsedLockFile().externalNodes;
      parsedLockFile.externalNodes = nodes;
      return {
        externalNodes: nodes,
      };
    }

    const externalNodes = getLockFileNodes(
      packageManager,
      lockFileContents,
      lockFileHash,
      context
    );
    parsedLockFile.externalNodes = externalNodes;
    return {
      externalNodes,
    };
  },
];

export const createDependencies: CreateDependencies = (
  _,
  ctx: CreateDependenciesContext
) => {
  const pluginConfig = jsPluginConfig(ctx.nxJsonConfiguration);

  const packageManager = detectPackageManager(workspaceRoot);

  let lockfileDependencies: RawProjectGraphDependency[] = [];
  // lockfile may not exist yet
  if (
    pluginConfig.analyzeLockfile &&
    lockFileExists(packageManager) &&
    parsedLockFile.externalNodes
  ) {
    const lockFilePath = join(workspaceRoot, getLockFileName(packageManager));
    const lockFileContents =
      packageManager !== 'bun'
        ? readFileSync(lockFilePath, 'utf-8')
        : readBunLockFile(lockFilePath);
    const lockFileHash = getLockFileHash(lockFileContents);

    if (!lockFileNeedsReprocessing(lockFileHash)) {
      lockfileDependencies = readCachedParsedLockFile().dependencies ?? [];
    } else {
      lockfileDependencies = getLockFileDependencies(
        packageManager,
        lockFileContents,
        lockFileHash,
        ctx
      );

      parsedLockFile.dependencies = lockfileDependencies;

      writeLastProcessedLockfileHash(lockFileHash, parsedLockFile);
    }
  }

  performance.mark('build typescript dependencies - start');
  const explicitProjectDependencies = buildExplicitDependencies(
    pluginConfig,
    ctx
  );
  performance.mark('build typescript dependencies - end');
  performance.measure(
    'build typescript dependencies',
    'build typescript dependencies - start',
    'build typescript dependencies - end'
  );
  return lockfileDependencies.concat(explicitProjectDependencies);
};

function getLockFileHash(lockFileContents: string) {
  return hashArray([nxVersion, lockFileContents]);
}

function lockFileNeedsReprocessing(lockHash: string) {
  try {
    return readFileSync(lockFileHashFile).toString() !== lockHash;
  } catch {
    return true;
  }
}

function writeLastProcessedLockfileHash(
  hash: string,
  lockFile: ParsedLockFile
) {
  mkdirSync(dirname(lockFileHashFile), { recursive: true });
  writeFileSync(cachedParsedLockFile, JSON.stringify(lockFile, null, 2));
  writeFileSync(lockFileHashFile, hash);
}

function readCachedParsedLockFile(): ParsedLockFile {
  return JSON.parse(readFileSync(cachedParsedLockFile).toString());
}

const lockFileHashFile = join(workspaceDataDirectory, 'lockfile.hash');
const cachedParsedLockFile = join(
  workspaceDataDirectory,
  'parsed-lock-file.json'
);
