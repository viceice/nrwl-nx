# Publish Conformance Rules to Nx Cloud

[Nx Cloud Enterprise](/enterprise) allows you to publish your organization's [Nx Conformance](/nx-enterprise/powerpack/conformance) rules to your Nx Cloud Organization, and consume them in any of your other Nx Workspaces without having to deal with the complexity and friction of dealing with a private NPM registry or similar. Authentication is handled automatically through your Nx Cloud connection and rules are downloaded and applied based on your preferences configured in the Nx Cloud UI.

Let's create a custom rule which we can then publish to Nx Cloud. We will first create a new library project to contain our rule (and any others we might create in the future):

```shell
nx generate @nx/js:library cloud-conformance-rules
```

The Nx Cloud distribution mechanism expects each rule to be created in a named subdirectory in the `src/` directory of our new project, and each rule directory to contain an `index.ts` and a `schema.json` file. You can read more about [creating a conformance rule](/reference/core-api/conformance/documents/create-conformance-rule) in the dedicated guide. For this recipe, we'll generate a default rule to use in the publishing process.

```shell
nx g @nx/conformance:create-rule --name=test-cloud-rule --directory=cloud-conformance-rules/src --category=reliability --description="A test cloud rule" --reporter=non-project-files-reporter
```

{% callout type="warning" title="Adding the @nx/conformance plugin" %}
If you get an error resolving the `@nx/conformance` plugin, you may need to add it. You can do this by running `nx add @nx/conformance` in your workspace.
{% /callout %}

We now have a valid implementation of a rule and we are ready to build it and publish it to Nx Cloud. The [`@nx/conformance` plugin](/reference/core-api/conformance) provides a [dedicated executor called `bundle-rules`](/reference/core-api/conformance/executors/bundle-rules) for creating appropriate build artifacts for this purpose. We will replace the existing build target and wire up that executor in our `cloud-conformance-rules` project's `project.json` file:

```jsonc {% fileName="cloud-conformance-rules/project.json" %}
{
  // ...any existing project.json content
  "targets": {
    // ...any other existing targets
    // new build target:
    "build": {
      "executor": "@nx/conformance:bundle-rules",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "{projectRoot}/dist"
      }
    }
  }
}
```

{% callout type="note" %}
Remove the existing `lib` directory within the `cloud-conformance-rules` project, as it is no longer needed. Each rule will have its own directory, which is generated by the `create-rule` generator, and will need to always have `index.ts` and `schema.json` files.
{% /callout %}

We can now run `nx build cloud-conformance-rules` to build our rule and create the build artifacts in the `cloud-conformance-rules/dist` directory (or wherever you prefer to configure that `outputPath` location). If we take a look at the output path location we will see the same structure of one named subdirectory per rule, now containing the (bundled) `index.js` and `schema.json` files.

Our final step is to publish the rule artifacts to Nx Cloud. We achieve this by running the `publish-conformance-rules` command on the `nx-cloud` CLI, passing the output path location as the first positional argument:

```shell
nx-cloud publish-conformance-rules cloud-conformance-rules/dist
```

Subsequent calls to this command will overwrite the previously published rule artifacts for that rule, including implementation and schema changes. Effectively, the rules are always "at HEAD" and do not therefore have explicit versioning. If you need to support different versions of various setups, you should write the rule implementation to handle it at runtime. This approach helps reduce a lot of complexity and friction when managing Nx Conformance configurations across your organization.

Because publishing the rules is a relatively common operation, you can also wire up a target in your `cloud-conformance-rules` project to wrap the CLI command. Therefore, including our build target from before, our `project.json` file now looks like this:

```jsonc {% fileName="cloud-conformance-rules/project.json" %}
{
  // ...any existing project.json content
  "targets": {
    "build": {
      "executor": "@nx/conformance:bundle-rules",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "{projectRoot}/dist"
      }
    },
    "publish": {
      "dependsOn": ["build"],
      "command": "npx nx-cloud publish-conformance-rules {projectRoot}/dist"
    }
  }
}
```

We can now run `nx publish cloud-conformance-rules` to both build and publish our rule (and any future rules in this project) to Nx Cloud.
