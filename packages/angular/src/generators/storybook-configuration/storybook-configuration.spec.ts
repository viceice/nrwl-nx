import type { Tree } from '@nx/devkit';
import { readJson, updateJson, writeJson } from '@nx/devkit';
import { componentGenerator } from '../component/component';
import { librarySecondaryEntryPointGenerator } from '../library-secondary-entry-point/library-secondary-entry-point';
import {
  createStorybookTestWorkspaceForLib,
  generateTestApplication,
} from '../utils/testing';
import type { StorybookConfigurationOptions } from './schema';
import { storybookConfigurationGenerator } from './storybook-configuration';

// nested code imports graph from the repo, which might have inaccurate graph version
jest.mock('nx/src/project-graph/project-graph', () => ({
  ...jest.requireActual<any>('nx/src/project-graph/project-graph'),
  createProjectGraphAsync: jest
    .fn()
    .mockImplementation(async () => ({ nodes: {}, dependencies: {} })),
}));

function listFiles(tree: Tree): string[] {
  const files = new Set<string>();
  tree.listChanges().forEach((change) => {
    if (change.type !== 'DELETE') {
      files.add(change.path);
    }
  });

  return Array.from(files).sort((a, b) => a.localeCompare(b));
}

describe('StorybookConfiguration generator', () => {
  let tree: Tree;
  const libName = 'test-ui-lib';

  beforeEach(async () => {
    tree = await createStorybookTestWorkspaceForLib(libName);

    jest.resetModules();
  });

  it('should only configure storybook', async () => {
    await storybookConfigurationGenerator(tree, <StorybookConfigurationOptions>{
      project: libName,
      generateStories: false,
      skipFormat: true,
    });

    expect(tree.exists('test-ui-lib/.storybook/main.ts')).toBeTruthy();
    expect(tree.exists('test-ui-lib/.storybook/tsconfig.json')).toBeTruthy();
    expect(
      tree.exists('test-ui-lib/src/lib/test-button/test-button.stories.ts')
    ).toBeFalsy();
    expect(
      tree.exists('test-ui-lib/src/lib/test-other/test-other.stories.ts')
    ).toBeFalsy();
  });

  it('should configure storybook to use webpack 5', async () => {
    await storybookConfigurationGenerator(tree, {
      project: libName,
      generateStories: false,
      linter: 'none',
      skipFormat: true,
    });

    expect(
      tree.read('test-ui-lib/.storybook/main.ts', 'utf-8')
    ).toMatchSnapshot();
  });

  it('should configure storybook with interaction tests and install dependencies', async () => {
    await storybookConfigurationGenerator(tree, <StorybookConfigurationOptions>{
      project: libName,
      generateStories: true,
    });

    expect(tree.exists('test-ui-lib/.storybook/main.ts')).toBeTruthy();
    expect(tree.exists('test-ui-lib/.storybook/tsconfig.json')).toBeTruthy();
    expect(
      tree.read(
        'test-ui-lib/src/lib/test-button/test-button.stories.ts',
        'utf-8'
      )
    ).toMatchSnapshot();
    expect(
      tree.read('test-ui-lib/src/lib/test-other/test-other.stories.ts', 'utf-8')
    ).toMatchSnapshot();

    const packageJson = JSON.parse(tree.read('package.json', 'utf-8'));
    expect(packageJson.devDependencies['@storybook/angular']).toBeDefined();
  });

  it('should generate the right files', async () => {
    // add standalone component
    await componentGenerator(tree, {
      name: 'standalone',
      path: `${libName}/src/lib/standalone/standalone`,
      standalone: true,
      skipFormat: true,
    });
    // add secondary entrypoint
    writeJson(tree, `${libName}/package.json`, { name: libName });
    await librarySecondaryEntryPointGenerator(tree, {
      library: libName,
      name: 'secondary-entry-point',
      skipFormat: true,
    });
    // add a regular component to the secondary entrypoint
    await componentGenerator(tree, {
      name: 'secondary-button',
      path: `${libName}/secondary-entry-point/src/lib/secondary-button/secondary-button`,
      export: true,
      skipFormat: true,
    });
    // add a standalone component to the secondary entrypoint
    await componentGenerator(tree, {
      name: 'secondary-standalone',
      path: `${libName}/secondary-entry-point/src/lib/secondary-standalone/secondary-standalone`,
      standalone: true,
      export: true,
      skipFormat: true,
    });

    await storybookConfigurationGenerator(tree, <StorybookConfigurationOptions>{
      project: libName,
      generateStories: true,
      skipFormat: true,
    });

    expect(listFiles(tree)).toMatchSnapshot();
  });

  it('should generate in the correct folder', async () => {
    // add standalone component
    await componentGenerator(tree, {
      name: 'standalone',
      path: `${libName}/src/lib/standalone/standalone`,
      standalone: true,
      skipFormat: true,
    });
    // add secondary entrypoint
    writeJson(tree, `${libName}/package.json`, { name: libName });
    await librarySecondaryEntryPointGenerator(tree, {
      library: libName,
      name: 'secondary-entry-point',
      skipFormat: true,
    });
    // add a regular component to the secondary entrypoint
    await componentGenerator(tree, {
      name: 'secondary-button',
      path: `${libName}/secondary-entry-point/src/lib/secondary-button/secondary-button`,
      export: true,
      skipFormat: true,
    });
    // add a standalone component to the secondary entrypoint
    await componentGenerator(tree, {
      name: 'secondary-standalone',
      path: `${libName}/secondary-entry-point/src/lib/secondary-standalone/secondary-standalone`,
      standalone: true,
      export: true,
      skipFormat: true,
    });

    await storybookConfigurationGenerator(tree, <StorybookConfigurationOptions>{
      project: libName,
      generateStories: true,
      skipFormat: true,
    });

    expect(listFiles(tree)).toMatchSnapshot();
  });

  it('should exclude Storybook-related files from tsconfig.editor.json for applications', async () => {
    // the tsconfig.editor.json is only generated for versions lower than v20
    updateJson(tree, 'package.json', (json) => {
      json.dependencies = {
        ...json.dependencies,
        '@angular/core': '~19.2.0',
      };
      return json;
    });
    await generateTestApplication(tree, { directory: 'test-app' });

    await storybookConfigurationGenerator(tree, {
      project: 'test-app',
      generateStories: false,
      skipFormat: true,
      linter: 'eslint',
    });

    const tsConfig = readJson(tree, 'test-app/tsconfig.editor.json');
    expect(tsConfig.exclude).toStrictEqual(
      expect.arrayContaining(['**/*.stories.ts', '**/*.stories.js'])
    );
  });
});
