import * as path from 'path';
import * as fs from 'fs';

// Revised flat-line-based directive merger with comment preservation

export type ParsedLine = {
  raw: string;
  key?: string; // present only if it's a directive line (%%...)
};

export function parseFlatDirectives(content: string): ParsedLine[] {
  // Only support \n and \r\n as line endings; do not handle legacy Mac \r
  const lines = content.split(/\r?\n/);
  return lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("%%")) {
      const key = trimmed.split(/\s+/, 1)[0];
      return { raw: line, key };
    }
    return { raw: line };
  });
}

export function mergeFlatDirectives(baseLines: ParsedLine[], overrideLines: ParsedLine[]): ParsedLine[] {

  if (baseLines.length === 0) {
    return overrideLines;
  }

  const keyToIndex = new Map<string, number>();

  // Index directives from the base
  baseLines.forEach((line, index) => {
    if (line.key) keyToIndex.set(line.key, index);
  });

  const additions: ParsedLine[] = [];

  for (let i = 0; i < overrideLines.length; i++) {
    const line = overrideLines[i];
    if (line.key) {
      const existingIdx = keyToIndex.get(line.key);
      if (existingIdx !== undefined) {
        // Replace existing directive line
        baseLines[existingIdx] = line;
      } else {
        // Also check if there's a comment block just above it
        const context: ParsedLine[] = [];
        let j = i - 1;
        while (j >= 0 && overrideLines[j].key === undefined && overrideLines[j].raw.trim().startsWith('%')) {
          context.unshift(overrideLines[j]);
          j--;
        }

        if (context.length > 0) {
          // Add a blank line before the directive if there are comments
          additions.push({ raw: '' });
        }

        additions.push(...context, line);
      }
    }
  }

  return [...baseLines, ...additions];
}

export function stringifyParsedLines(lines: ParsedLine[], lineEnding: string = '\n'): string {
  // Use the provided lineEnding (default \n) to join lines
  return lines.map(l => l.raw).join(lineEnding);
}

/**
 * Extracts all directives (%% and comments) before the first X: line from a raw ABC file.
 * Returns the parsed directives and the rest of the file (from X: onward).
 */
export function extractDirectivesAndBody(abcText: string): { directives: ParsedLine[], body: string, lineEnding: string } {
  // Detect the line ending from the first line break in the file (only \r\n or \n)
  const match = abcText.match(/\r\n|\n/);
  const lineEnding = match ? match[0] : '\n';
  const lines = abcText.split(/\r?\n/);
  const directives: ParsedLine[] = [];
  let firstX = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('X:')) {
      firstX = i;
      break;
    }
    directives.push(...parseFlatDirectives(line));
  }
  const body = firstX >= 0 ? lines.slice(firstX).join(lineEnding) : abcText;
  return { directives, body, lineEnding };
}

/**
 * Finds all .abcconfig files from the directory of rawAbcFilePath up to rootDir, merges their directives with those from the ABC file,
 * and returns the merged directives as a string and the rest of the file.
 *
 * @param rootDir The root directory to stop searching for .abcconfig files
 * @param rawAbcFilePath The absolute path to the .abc file
 */
export function getEffectiveAbcConfig(
  rootDir: string,
  rawAbcFilePath: string
): { mergedDirectives: string, body: string } {
  // 1. Find all .abcconfig files from fileDir up to rootDir
  const abcConfFiles: string[] = [];
  let dir = path.dirname(rawAbcFilePath);
  while (true) {
    const abcConfPath = path.join(dir, '.abcconfig');
    if (fs.existsSync(abcConfPath)) {
      abcConfFiles.unshift(abcConfPath); // parent first
    }
    if (rootDir === dir || dir === path.dirname(dir)) break;
    dir = path.dirname(dir);
  }

  // 2. Parse and merge all found directives
  let mergedDirectives: ParsedLine[] = [];
  for (const file of abcConfFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const parsed = parseFlatDirectives(content);
    mergedDirectives = mergeFlatDirectives(mergedDirectives, parsed);
  }

  // 3. Extract directives from the .abc file before the first X: line
  const abcText = fs.readFileSync(rawAbcFilePath, 'utf8');
  const { directives: abcDirectives, body, lineEnding } = extractDirectivesAndBody(abcText);
  mergedDirectives = mergeFlatDirectives(mergedDirectives, abcDirectives);

  return { mergedDirectives: stringifyParsedLines(mergedDirectives, lineEnding), body };
}