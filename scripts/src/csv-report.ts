import { promises as fs } from "node:fs";
import path from "node:path";

export function csvEscape(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const text = String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export async function appendCsvRows(resultsFile: string, header: string, rows: string[]): Promise<string> {
  const outputPath = path.resolve(process.cwd(), resultsFile);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const fileExists = await fs
    .access(outputPath)
    .then(() => true)
    .catch(() => false);

  if (!fileExists) {
    await fs.writeFile(outputPath, `${header}\n`, "utf8");
  }

  if (rows.length > 0) {
    await fs.appendFile(outputPath, `${rows.join("\n")}\n`, "utf8");
  }

  return outputPath;
}
