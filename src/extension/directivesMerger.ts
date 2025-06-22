// Revised flat-line-based directive merger with comment preservation

export type ParsedLine = {
  raw: string;
  key?: string; // present only if it's a directive line (%%...)
};

export function parseFlatDirectives(content: string): ParsedLine[] {
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

export function stringifyParsedLines(lines: ParsedLine[]): string {
  return lines.map(l => l.raw).join('\n');
}