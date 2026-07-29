/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-cross-module-internal-imports",
      severity: "error",
      comment:
        "Modules may only import another module's index.ts, never its internals. Exception: schema.ts → schema.ts imports for cross-domain FKs.",
      from: { path: "^src/modules/([^/]+)" },
      to: {
        path: "^src/modules/(?!$1)([^/]+)",
        pathNot: "/(index\\.ts|schema\\.ts)$",
      },
    },
    {
      name: "no-schema-import-from-service",
      severity: "error",
      comment:
        "Services must not import schema.ts directly from another module. Use the module's index.ts exports.",
      from: { path: "^src/modules/([^/]+)/(service|controller|routes|repository|entities)" },
      to: { path: "^src/modules/(?!$1)[^/]+/schema\\.ts" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies between modules are forbidden beyond the schema.ts → schema.ts case.",
      from: { pathNot: "/schema\\.ts$" },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default"],
    },
  },
};