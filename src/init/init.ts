import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type InitOptions = {
  cwd: string;
  apply: boolean;
};

type InitChange = {
  file: string;
  description: string;
};

const importReplacements: Array<[string, string]> = [
  ["@ai-hero/sandcastle/sandboxes/docker", "donjon/sandboxes/docker"],
  ["@ai-hero/sandcastle/sandboxes/podman", "donjon/sandboxes/podman"],
  ["@ai-hero/sandcastle/sandboxes/vercel", "donjon/sandboxes/vercel"],
  ["@ai-hero/sandcastle/sandboxes/daytona", "donjon/sandboxes/daytona"],
  ["@ai-hero/sandcastle", "donjon/sandcastle"],
];

export function runInit(options: InitOptions): void {
  const changes: InitChange[] = [];
  const mainPath = join(options.cwd, ".sandcastle", "main.mts");
  const packagePath = join(options.cwd, "package.json");

  if (existsSync(mainPath)) {
    const original = readFileSync(mainPath, "utf8");
    const updated = replaceImports(original);
    if (updated !== original) {
      changes.push({
        file: ".sandcastle/main.mts",
        description: "replace Sandcastle imports with Donjon wrapper imports",
      });
      if (options.apply) {
        writeFileSync(mainPath, updated);
      }
    }
  }

  if (existsSync(packagePath)) {
    const original = readFileSync(packagePath, "utf8");
    const packageJson = JSON.parse(original) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};
    if (scripts["sandcastle:donjon"] !== "donjon run .sandcastle/main.mts") {
      packageJson.scripts = {
        ...scripts,
        "sandcastle:donjon": "donjon run .sandcastle/main.mts",
      };
      changes.push({
        file: "package.json",
        description: "add sandcastle:donjon script",
      });
      if (options.apply) {
        writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
      }
    }
  }

  printInitSummary(options, changes);
}

export function runDoctor(cwd: string): void {
  const packagePath = join(cwd, "package.json");
  const sandcastleDir = join(cwd, ".sandcastle");
  const mainPath = join(sandcastleDir, "main.mts");
  const hasPackage = existsSync(packagePath);
  const hasSandcastleDir = existsSync(sandcastleDir);
  const hasMain = existsSync(mainPath);
  const mainSource = hasMain ? readFileSync(mainPath, "utf8") : "";
  const hasDonjonImports = mainSource.includes("donjon/sandcastle") || mainSource.includes("donjon/sandboxes/");
  const sandcastleResolvable = isResolvableFrom(cwd, "@ai-hero/sandcastle");

  console.log(`cwd: ${cwd}`);
  console.log(`node version: ${process.version}`);
  console.log(`.sandcastle exists: ${yesNo(hasSandcastleDir)}`);
  console.log(`.sandcastle/main.mts exists: ${yesNo(hasMain)}`);
  console.log(`package.json exists: ${yesNo(hasPackage)}`);
  console.log(`@ai-hero/sandcastle resolvable: ${yesNo(sandcastleResolvable)}`);
  console.log(`donjon wrapper imports present: ${yesNo(hasDonjonImports)}`);
  console.log(`suggested next command: ${hasDonjonImports ? "donjon run .sandcastle/main.mts" : "donjon init --dry-run"}`);
}

export function replaceImports(source: string): string {
  let updated = source;
  for (const [from, to] of importReplacements) {
    updated = updated.replaceAll(from, to);
  }
  return updated;
}

function printInitSummary(options: InitOptions, changes: InitChange[]): void {
  console.log("Donjon setup");
  console.log(`mode: ${options.apply ? "apply" : "dry-run"}`);

  if (changes.length === 0) {
    console.log("No file changes needed.");
  } else {
    console.log("Changes:");
    for (const change of changes) {
      console.log(`- ${change.file}: ${change.description}`);
    }
  }

  if (!options.apply) {
    console.log("");
    console.log("Run `donjon init --apply` to write these changes.");
  }

  console.log("");
  console.log("After setup, run `npm run sandcastle:donjon`.");
}

function isResolvableFrom(cwd: string, specifier: string): boolean {
  try {
    const requireFromProject = createRequire(join(cwd, "package.json"));
    requireFromProject.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
