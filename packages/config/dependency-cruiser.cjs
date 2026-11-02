// Package boundary rules — docs/tasks/01-architecture.md §3.2. `pnpm boundaries` fails on any violation.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "not-to-unresolvable",
      comment:
        "Every import must resolve (catches imports of packages not installed for this workspace).",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-non-package-json",
      comment: "Import only packages declared in the importing workspace's package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "contracts-is-pure",
      comment: "packages/contracts may import only zod.",
      severity: "error",
      from: { path: "^packages/contracts/src/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm", "npm-dev", "npm-peer"], pathNot: "node_modules/zod/" },
    },
    {
      name: "domain-has-no-platform",
      comment: "packages/domain is pure logic: no React, React Native, Nest, Prisma.",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "node_modules/(react|react-native|@nestjs|@prisma|prisma)(/|$)" },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "app-not-api",
      comment: "The Expo app never imports the API or Prisma.",
      severity: "error",
      from: { path: "^apps/app/" },
      to: { path: "(^apps/api/|node_modules/(@prisma|prisma|@nestjs)(/|$))" },
    },
    {
      name: "api-not-ui",
      comment: "The API never imports UI packages or the generated client.",
      severity: "error",
      from: { path: "^apps/api/" },
      to: {
        path: "(^apps/app/|^packages/(design-system|api-client)/|node_modules/(react|react-native)(/|$))",
      },
    },
    {
      name: "design-system-no-data",
      severity: "error",
      from: { path: "^packages/design-system/" },
      to: { path: "(^packages/api-client/|node_modules/@nestjs/)" },
    },
    {
      name: "api-modules-use-facades",
      comment: "A module may import another module only through its *.facade.ts or events/.",
      severity: "error",
      from: { path: "^apps/api/src/modules/([^/]+)/" },
      to: {
        path: "^apps/api/src/modules/([^/]+)/",
        pathNot: [
          "^apps/api/src/modules/$1/",
          "^apps/api/src/modules/[^/]+/[^/]+\\.facade\\.ts$",
          "^apps/api/src/modules/[^/]+/events/",
        ],
      },
    },
    {
      name: "no-webview-no-next",
      comment: "Single universal Expo frontend: no Next.js, no WebView shells (master prompt §1).",
      severity: "error",
      from: {},
      to: { path: "node_modules/(next|react-native-webview)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(\\.expo|dist|dist-web|\\.turbo|ios|android|coverage)/" },
    tsPreCompilationDeps: true,
    // Resolves the app's "@/..." alias. Add more tsconfigs here if other packages get path aliases.
    tsConfig: { fileName: "apps/app/tsconfig.json" },
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types", "react-native"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
  },
};
