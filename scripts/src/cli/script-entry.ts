import { pathToFileURL } from "node:url";

function isMain(importMetaUrl: string): boolean {
  if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    return true;
  }

  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(process.argv[1]).href === importMetaUrl;
}

export function runCli(main: () => Promise<void>, importMetaUrl: string): void {
  if (!isMain(importMetaUrl)) {
    return;
  }

  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
