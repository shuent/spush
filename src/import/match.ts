export function matchesTransferPatterns(
  filePath: string,
  include: string[],
  exclude: string[],
): boolean {
  const normalizedPath = normalizePattern(filePath);
  const included =
    include.length === 0 || include.some((pattern) => matches(pattern, normalizedPath));
  if (!included) {
    return false;
  }

  return !exclude.some((pattern) => matches(pattern, normalizedPath));
}

function matches(pattern: string, filePath: string): boolean {
  return expandBraces(normalizePattern(pattern)).some((expanded) =>
    globToRegExp(expanded).test(filePath),
  );
}

function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]+)\}/.exec(pattern);
  if (!match) {
    return [pattern];
  }

  const [token, content] = match;
  return content.split(",").flatMap((part) => expandBraces(pattern.replace(token, part.trim())));
}

function globToRegExp(pattern: string): RegExp {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        const next = pattern[index + 2];
        index += 1;

        if (next === "/") {
          source += "(?:.*/)?";
          index += 1;
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`^${source}$`);
}

function normalizePattern(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
