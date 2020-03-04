import * as yargs from 'yargs';
import { runCommand } from '../tasks-runner/run-command';
import { NxArgs, splitArgsIntoNxArgsAndOverrides } from './utils';
import {
  createProjectGraph,
  ProjectGraph,
  ProjectGraphNode,
  withDeps
} from '../core/project-graph';
import { readEnvironment } from '../core/file-utils';
import { DefaultReporter } from '../tasks-runner/default-reporter';
import { projectHasTarget } from '../utils/project-graph-utils';
import { output } from "../utils/output";

export function runMany(parsedArgs: yargs.Arguments): void {
  const { nxArgs, overrides } = splitArgsIntoNxArgsAndOverrides(
    parsedArgs,
    'run-many'
  );
  const projectGraph = createProjectGraph();
  const projects = projectsToRun(nxArgs, projectGraph);
  const projectMap: Record<string, ProjectGraphNode> = {};
  projects.forEach(proj => {
    projectMap[proj.name] = proj;
  });
  const env = readEnvironment(nxArgs.target, projectMap);
  runCommand(
    projects,
    projectGraph,
    env,
    nxArgs,
    overrides,
    new DefaultReporter()
  );
}

function projectsToRun(nxArgs: NxArgs, projectGraph: ProjectGraph) {
  const allProjects = Object.values(projectGraph.nodes);
  if (nxArgs.all) {
    return runnableForTarget(allProjects, nxArgs.target);
  } else {
    checkForInvalidProjects(nxArgs, allProjects);
    let selectedProjects = allProjects.filter(
      p => nxArgs.projects.indexOf(p.name) > -1
    );
    if (nxArgs.withDeps) {
      selectedProjects = Object.values(
        withDeps(projectGraph, selectedProjects).nodes
      );
    }
    return runnableForTarget(selectedProjects, nxArgs.target, true);
  }
}

function checkForInvalidProjects(
  nxArgs: NxArgs,
  allProjects: ProjectGraphNode[]
) {
  const invalid = nxArgs.projects.filter(
    name => !allProjects.find(p => p.name === name)
  );
  if (invalid.length !== 0) {
    throw new Error(`Invalid projects: ${invalid.join(', ')}`);
  }
}

function runnableForTarget(
  projects: ProjectGraphNode[],
  target: string,
  strict = false
): ProjectGraphNode[] {
  const notRunnable = [];
  const runnable = [];

  for (let project of projects) {
    if (projectHasTarget(project, target)) {
      runnable.push(project);
    } else {
      notRunnable.push(project);
    }
  }

  if (strict && notRunnable.length) {
    output.warn({
      title: `the following do not have configuration for "${target}"`,
      bodyLines: notRunnable.map(p => '- ' + p)
    });
  }

  return runnable;
}
