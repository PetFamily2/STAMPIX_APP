import fs from 'node:fs';
import path from 'node:path';

export const RTL_SOURCE_ROOTS = [
  'index.js',
  'app',
  'components',
  'screens',
  'lib',
  'constants',
  'config',
];

export const RTL_ARCHITECTURE_CONFIG_PATH = 'config/rtlArchitecture.json';

const RTL_SOURCE_FILE = 'lib/rtl.ts';
const MANUAL_MARKER_PATTERN = /^stampaix-rtl-manual-row-right-v1$/;
const SOURCE_EXTENSION_PATTERN = /\.(tsx?|jsx?|json)$/;

const FORBIDDEN_GLOBALS = [
  { label: 'NEEDS_MANUAL_RTL', pattern: /\bNEEDS_MANUAL_RTL\b/ },
  { label: 'IS_NATIVE_RTL', pattern: /\bIS_NATIVE_RTL\b/ },
  {
    label: 'native RTL manager',
    pattern: new RegExp(String.raw`\bI18n` + String.raw`Manager\b`),
  },
];

const RAW_STYLE_PATTERNS = [
  { label: 'raw flexDirection row', pattern: /\bflexDirection:\s*['"]row['"]/ },
  {
    label: 'raw flexDirection row-reverse',
    pattern: /\bflexDirection:\s*['"]row-reverse['"]/,
  },
  {
    label: 'raw alignItems flex-start/end',
    pattern: /\balignItems:\s*['"]flex-(?:start|end)['"]/,
  },
  {
    label: 'raw justifyContent flex-start/end',
    pattern: /\bjustifyContent:\s*['"]flex-(?:start|end)['"]/,
  },
  {
    label: 'raw alignSelf flex-start/end',
    pattern: /\balignSelf:\s*['"]flex-(?:start|end)['"]/,
  },
];

const RAW_NATIVEWIND_TOKENS = [
  'flex-row',
  'items-start',
  'items-end',
  'justify-start',
  'justify-end',
  'self-start',
  'self-end',
];

const END_ALIGNMENT_PATTERNS = [
  { label: 'alignItems.end', pattern: /\balignItems:\s*alignItems\.end\b/ },
  {
    label: 'justifyContent.end',
    pattern: /\bjustifyContent:\s*justifyContent\.end\b/,
  },
  { label: 'alignSelf flex-end', pattern: /\balignSelf:\s*['"]flex-end['"]/ },
  { label: 'tw.itemsEnd', pattern: /\btw\.itemsEnd\b/ },
  { label: 'tw.justifyEnd', pattern: /\btw\.justifyEnd\b/ },
];

const ALLOWED_END_ALIGNMENT_STYLES = new Set([
  'app/(auth)/onboarding-client-otp.tsx:footer',
  'app/(authenticated)/(business)/settings-business-referrals.tsx:emptyActionButton',
  'app/(authenticated)/(customer)/referrals.tsx:emptyActionButton',
  'components/business-dashboard/BusinessReferralCard.tsx:modalOverlay',
  'components/business-ui/BarComparisonChart.tsx:columnTrack',
  'components/business-ui/BarComparisonChart.tsx:plotArea',
  'components/subscription/UpgradeModal.tsx:overlay',
]);

const ALLOWED_RAW_STYLE_FINDINGS = new Set([
  'components/guidance/GuidedActionOverlay.tsx:layer:raw justifyContent flex-start/end',
  // On a row this is vertical cross-axis top alignment, not RTL direction.
  'screens/SettingsScreen.tsx:notificationToggleInner:raw alignItems flex-start/end',
]);

const ALLOWED_LTR_STYLES = new Set([
  'app/+not-found.tsx:debugValue',
  'app/(auth)/onboarding-client-otp.tsx:digitInput',
  'app/(auth)/onboarding-client-otp.tsx:digitsContainer',
  'app/(auth)/sign-up-email.tsx:input',
  'app/(authenticated)/(business)/scanner.tsx:programSlider',
  'app/(authenticated)/(business)/scanner.tsx:programSliderContent',
  'app/(authenticated)/(business)/scanner.tsx:programSliderViewport',
  'components/business-dashboard/CompactActivitySummaryRow.tsx:time',
  'components/business-dashboard/CompactActivitySummaryRow.tsx:timeWrap',
  'components/business-dashboard/DashboardHeader.tsx:brandLine',
  'components/business-dashboard/LifetimeMetricsRow.tsx:helperAmount',
  'components/business-ui/ActivityTimeline.tsx:time',
  'components/business-ui/HorizontalRankingChart.tsx:rowValue',
  'components/customer/CustomerBrandTitleRow.tsx:brandWrap',
  'components/legal/LegalDocumentScreen.tsx:urlText',
  'lib/rtl.ts:ltrBaseText',
  'lib/rtl.ts:ltrIslandView',
]);

const LTR_STYLE_PATTERN =
  /\b(?:textAlign:\s*['"]left['"]|writingDirection:\s*['"]ltr['"]|direction:\s*['"]ltr['"])/;
const HEBREW_ESCAPE = /\\u05[0-9a-fA-F]{2}/g;
const ALLOWED_ESCAPES = new Set(['\\u0590', '\\u05FF', '\\u05ff']);
const HEBREW_REGEX_ESCAPE_CONTEXTS = [
  {
    file: 'lib/businessAddressSelection.ts',
    pattern: /\^\[0-9A-Za-z\\u05D0-\\u05EA\\u05F3\\u05F4/,
  },
];
const MOJIBAKE_MARKERS = [/\uFFFD/, /×[\u05d0-\u05ea]/, /Ã./, /Ð./];

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const REGEX_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);
const REGEX_CONTROL_CONDITION_KEYWORDS = new Set([
  'for',
  'if',
  'while',
  'with',
]);

function opensRegexControlCondition(tokens) {
  const previous = tokens.at(-1);
  if (
    previous?.type === 'identifier' &&
    REGEX_CONTROL_CONDITION_KEYWORDS.has(previous.value) &&
    tokens.at(-2)?.value !== '.'
  ) {
    return true;
  }
  return previous?.value === 'await' && tokens.at(-2)?.value === 'for';
}

function countNewlines(value) {
  return value.match(/\n/g)?.length ?? 0;
}

function stringCompletesImportDeclaration(tokens) {
  const previous = tokens.at(-1);
  if (
    previous?.type === 'identifier' &&
    previous.value === 'import' &&
    tokens.at(-2)?.value !== '.'
  ) {
    return true;
  }
  if (previous?.type !== 'identifier' || previous.value !== 'from') {
    return false;
  }

  let braceDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.value === '}') {
      braceDepth += 1;
    } else if (token.value === '{') {
      braceDepth -= 1;
    } else if (token.value === ']') {
      bracketDepth += 1;
    } else if (token.value === '[') {
      bracketDepth -= 1;
    } else if (token.value === ')') {
      parenthesisDepth += 1;
    } else if (token.value === '(') {
      parenthesisDepth -= 1;
    }

    if (braceDepth < 0 || bracketDepth < 0 || parenthesisDepth < 0) {
      return false;
    }
    if (braceDepth !== 0 || bracketDepth !== 0 || parenthesisDepth !== 0) {
      continue;
    }
    if (token.value === ';' || token.value === 'export') {
      return false;
    }
    if (token.type === 'identifier' && token.value === 'import') {
      return tokens[index - 1]?.value !== '.';
    }
  }
  return false;
}

function startsExportDefaultExpression(tokens, identifier) {
  return (
    identifier === 'default' &&
    tokens.at(-1)?.type === 'identifier' &&
    tokens.at(-1)?.value === 'export' &&
    tokens.at(-2)?.value !== '.'
  );
}

function shouldStartRegex(tokens, nextChar, currentLine) {
  const previous = tokens.at(-1);
  if (!previous) {
    return true;
  }

  // TSX closing tags use a slash after `<`; they are not regex literals.
  if (
    previous.value === '<' &&
    (nextChar === '>' || IDENTIFIER_START.test(nextChar ?? ''))
  ) {
    return false;
  }
  // A TSX self-closing slash can follow a JSX expression container.
  if (nextChar === '>') {
    return false;
  }
  if (
    previous.type === 'string' &&
    previous.completesImportDeclaration === true &&
    previous.endLine < currentLine
  ) {
    return true;
  }
  if (previous.startsExportDefaultExpression === true) {
    return true;
  }
  if (
    previous.type === 'identifier' &&
    REGEX_PREFIX_KEYWORDS.has(previous.value)
  ) {
    return true;
  }
  if (previous.value === ')') {
    return previous.closesControlCondition === true;
  }
  // In this controlled contract a slash after a completed executable block
  // starts a statement-level regex. Ambiguous object-literal division fails
  // closed as a regex instead of exposing its contents as executable tokens.
  if (previous.value === '}') {
    return true;
  }
  if (
    previous.type === 'identifier' ||
    previous.type === 'number' ||
    previous.type === 'string' ||
    previous.type === 'template' ||
    previous.type === 'regex' ||
    previous.value === ']'
  ) {
    return false;
  }
  return true;
}

function scanOpaqueTemplate(source, start, startLine) {
  const lineAt = (position) =>
    startLine + countNewlines(source.slice(start, position));

  function scanQuotedString(cursor) {
    const quote = source[cursor];
    const quoteStart = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (source[cursor] === quote) {
        return cursor + 1;
      }
      if (source[cursor] === '\n' || source[cursor] === '\r') {
        throw new Error(
          `unterminated quoted string at line ${lineAt(quoteStart)}`
        );
      }
      cursor += 1;
    }
    throw new Error(`unterminated quoted string at line ${lineAt(quoteStart)}`);
  }

  function scanBlockComment(cursor) {
    const commentStart = cursor;
    cursor += 2;
    while (
      cursor < source.length &&
      !(source[cursor] === '*' && source[cursor + 1] === '/')
    ) {
      cursor += 1;
    }
    if (cursor >= source.length) {
      throw new Error(
        `unterminated block comment at line ${lineAt(commentStart)}`
      );
    }
    return cursor + 2;
  }

  function scanRegexLiteral(cursor) {
    const regexStart = cursor;
    cursor += 1;
    let inCharacterClass = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === '\\') {
        if (
          source[cursor + 1] === '\n' ||
          source[cursor + 1] === '\r' ||
          cursor + 1 >= source.length
        ) {
          break;
        }
        cursor += 2;
        continue;
      }
      if (char === '\n' || char === '\r') {
        break;
      }
      if (char === '[') {
        inCharacterClass = true;
      } else if (char === ']') {
        inCharacterClass = false;
      } else if (char === '/' && !inCharacterClass) {
        cursor += 1;
        while (IDENTIFIER_PART.test(source[cursor] ?? '')) {
          cursor += 1;
        }
        return cursor;
      }
      cursor += 1;
    }
    const state = inCharacterClass
      ? 'unterminated regex character class'
      : 'unterminated regex literal';
    throw new Error(`${state} at line ${lineAt(regexStart)}`);
  }

  function scanTemplateLiteral(cursor) {
    const templateStart = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      if (source[cursor] === '`') {
        return cursor + 1;
      }
      if (source[cursor] === '$' && source[cursor + 1] === '{') {
        cursor = scanTemplateInterpolation(cursor + 2);
        continue;
      }
      cursor += 1;
    }
    throw new Error(
      `unterminated template literal at line ${lineAt(templateStart)}`
    );
  }

  function scanTemplateInterpolation(cursor) {
    const interpolationStart = cursor - 2;
    const contextTokens = [];
    const parenthesisStack = [];
    let braceDepth = 0;

    function pushContextToken(type, value, metadata = {}) {
      contextTokens.push({ type, value, ...metadata });
    }

    while (cursor < source.length) {
      const char = source[cursor];
      const next = source[cursor + 1];

      if (/\s/.test(char)) {
        cursor += 1;
        continue;
      }
      if (char === '/' && next === '/') {
        cursor += 2;
        while (cursor < source.length && source[cursor] !== '\n') {
          cursor += 1;
        }
        continue;
      }
      if (char === '/' && next === '*') {
        cursor = scanBlockComment(cursor);
        continue;
      }
      if (char === "'" || char === '"') {
        cursor = scanQuotedString(cursor);
        pushContextToken('string', '<string>');
        continue;
      }
      if (char === '`') {
        cursor = scanTemplateLiteral(cursor);
        pushContextToken('template', '<template>');
        continue;
      }
      if (char === '/' && shouldStartRegex(contextTokens, next)) {
        cursor = scanRegexLiteral(cursor);
        pushContextToken('regex', '<regex>');
        continue;
      }
      if (IDENTIFIER_START.test(char)) {
        const identifierStart = cursor;
        cursor += 1;
        while (IDENTIFIER_PART.test(source[cursor] ?? '')) {
          cursor += 1;
        }
        pushContextToken('identifier', source.slice(identifierStart, cursor));
        continue;
      }
      if (/[0-9]/.test(char)) {
        const numberStart = cursor;
        cursor += 1;
        while (/[0-9A-Za-z_.]/.test(source[cursor] ?? '')) {
          cursor += 1;
        }
        pushContextToken('number', source.slice(numberStart, cursor));
        continue;
      }

      if (char === '}' && braceDepth === 0) {
        if (parenthesisStack.length > 0) {
          throw new Error(
            `unterminated template interpolation at line ${lineAt(interpolationStart)}`
          );
        }
        return cursor + 1;
      }

      const metadata = {};
      if (char === '(') {
        parenthesisStack.push(opensRegexControlCondition(contextTokens));
      } else if (char === ')') {
        if (parenthesisStack.length === 0) {
          throw new Error(
            `unbalanced closing parenthesis at line ${lineAt(cursor)}`
          );
        }
        metadata.closesControlCondition = parenthesisStack.pop();
      } else if (char === '{') {
        braceDepth += 1;
      } else if (char === '}') {
        braceDepth -= 1;
      }
      pushContextToken('punctuator', char, metadata);
      cursor += 1;
    }

    throw new Error(
      `unterminated template interpolation at line ${lineAt(interpolationStart)}`
    );
  }

  return scanTemplateLiteral(start);
}

/**
 * Tokenizes only the syntax needed by the controlled retention contract.
 * Comments and literal contents never become executable identifier tokens,
 * while regex/template braces are kept out of executable brace depth.
 */
function tokenizeExecutableSource(source) {
  const tokens = [];
  const parenthesisStack = [];
  let index = 0;
  let line = 1;

  function pushToken(type, value, start, end, startLine, metadata = {}) {
    const tokenSource = source.slice(start, end);
    const endLine = startLine + countNewlines(tokenSource);
    tokens.push({
      type,
      value,
      line: startLine,
      endLine,
      depth: 0,
      ...metadata,
    });
    line = endLine;
    index = end;
  }

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (/\s/.test(char)) {
      if (char === '\n') {
        line += 1;
      }
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      const start = index;
      const startLine = line;
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        index += 1;
      }
      if (index >= source.length) {
        throw new Error(`unterminated block comment at line ${startLine}`);
      }
      index += 2;
      line = startLine + countNewlines(source.slice(start, index));
      continue;
    }

    if (char === "'" || char === '"') {
      const start = index;
      const startLine = line;
      const quote = char;
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          closed = true;
          break;
        }
        if (source[index] === '\n' || source[index] === '\r') {
          throw new Error(`unterminated quoted string at line ${startLine}`);
        }
        index += 1;
      }
      if (!closed) {
        throw new Error(`unterminated quoted string at line ${startLine}`);
      }
      pushToken(
        'string',
        source.slice(start + 1, index - 1),
        start,
        index,
        startLine,
        {
          completesImportDeclaration: stringCompletesImportDeclaration(tokens),
        }
      );
      continue;
    }

    if (char === '`') {
      const start = index;
      const startLine = line;
      const end = scanOpaqueTemplate(source, start, startLine);
      pushToken('template', '<template>', start, end, startLine);
      continue;
    }

    if (char === '/' && shouldStartRegex(tokens, next, line)) {
      const start = index;
      const startLine = line;
      index += 1;
      let inCharacterClass = false;
      let closed = false;
      while (index < source.length) {
        const regexChar = source[index];
        if (regexChar === '\\') {
          if (
            source[index + 1] === '\n' ||
            source[index + 1] === '\r' ||
            index + 1 >= source.length
          ) {
            break;
          }
          index += 2;
          continue;
        }
        if (regexChar === '\n' || regexChar === '\r') {
          throw new Error(`unterminated regex literal at line ${startLine}`);
        }
        if (regexChar === '[') {
          inCharacterClass = true;
        } else if (regexChar === ']') {
          inCharacterClass = false;
        } else if (regexChar === '/' && !inCharacterClass) {
          index += 1;
          while (IDENTIFIER_PART.test(source[index] ?? '')) {
            index += 1;
          }
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        const state = inCharacterClass
          ? 'unterminated regex character class'
          : 'unterminated regex literal';
        throw new Error(`${state} at line ${startLine}`);
      }
      pushToken('regex', '<regex>', start, index, startLine);
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      const start = index;
      const startLine = line;
      index += 1;
      while (IDENTIFIER_PART.test(source[index] ?? '')) {
        index += 1;
      }
      const identifier = source.slice(start, index);
      pushToken('identifier', identifier, start, index, startLine, {
        startsExportDefaultExpression: startsExportDefaultExpression(
          tokens,
          identifier
        ),
      });
      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = index;
      const startLine = line;
      index += 1;
      while (/[0-9A-Za-z_.]/.test(source[index] ?? '')) {
        index += 1;
      }
      pushToken('number', source.slice(start, index), start, index, startLine);
      continue;
    }

    const metadata = {};
    if (char === '(') {
      parenthesisStack.push(opensRegexControlCondition(tokens));
    } else if (char === ')') {
      if (parenthesisStack.length === 0) {
        throw new Error(`unbalanced closing parenthesis at line ${line}`);
      }
      metadata.closesControlCondition = parenthesisStack.pop();
    }
    pushToken('punctuator', char, index, index + 1, line, metadata);
  }

  if (parenthesisStack.length > 0) {
    throw new Error('unbalanced executable parentheses at end of source');
  }

  let depth = 0;
  for (const token of tokens) {
    if (token.value === '}') {
      depth -= 1;
      if (depth < 0) {
        throw new Error(`unbalanced closing brace at line ${token.line}`);
      }
    }
    token.depth = depth;
    if (token.value === '{') {
      depth += 1;
    }
  }
  if (depth !== 0) {
    throw new Error('unbalanced executable braces at end of source');
  }

  return tokens;
}

function tokenMatches(token, expected) {
  if (typeof expected === 'string') {
    return token?.value === expected;
  }
  return token?.type === expected.type && token.value === expected.value;
}

function sequenceMatches(tokens, start, expected) {
  return expected.every((value, offset) =>
    tokenMatches(tokens[start + offset], value)
  );
}

function findTopLevelSequences(tokens, expected) {
  const matches = [];
  for (let index = 0; index <= tokens.length - expected.length; index += 1) {
    if (tokens[index].depth === 0 && sequenceMatches(tokens, index, expected)) {
      const lastIndex = index + expected.length - 1;
      matches.push({ start: index, end: lastIndex });
    }
  }
  return matches;
}

function hasExactCanonicalMarkerDeclaration(tokens, expected) {
  const matches = findTopLevelSequences(tokens, expected);
  if (matches.length !== 1) {
    return false;
  }

  const match = matches[0];
  const declarationEnd = tokens[match.end];
  const next = tokens[match.end + 1];
  if (!next || next.value === ';') {
    return true;
  }

  return next.line > declarationEnd.endLine && next.value === 'type';
}

function extractStrictRetentionBody(tokens) {
  const signature = [
    'export',
    'function',
    'retainRtlArchitectureMarker',
    '(',
    ')',
    '{',
  ];
  const signatures = findTopLevelSequences(tokens, signature);
  if (signatures.length !== 1) {
    return null;
  }

  const openBraceIndex = signatures[0].end;
  let braceDepth = 1;
  for (let index = openBraceIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index].value === '{') {
      braceDepth += 1;
    } else if (tokens[index].value === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) {
        return tokens.slice(openBraceIndex + 1, index);
      }
    }
  }
  return null;
}

function hasStrictRetentionAssignment(tokens) {
  const body = extractStrictRetentionBody(tokens);
  if (!body) {
    return false;
  }
  const bodyWithoutSemicolon =
    body.at(-1)?.value === ';' ? body.slice(0, -1) : body;
  return (
    sequenceMatches(bodyWithoutSemicolon, 0, [
      '(',
      'globalThis',
      'as',
      'RtlArchitectureGlobal',
      ')',
      '.',
      '__APP_RTL_ARCHITECTURE_MARKER__',
      '=',
      'RTL_ARCHITECTURE_MARKER',
    ]) && bodyWithoutSemicolon.length === 9
  );
}

function countModuleScopeRetentionCalls(tokens, rootImportMatches) {
  const importStatementEnds = new Set(
    rootImportMatches.map(({ end }) =>
      tokens[end + 1]?.value === ';' ? end + 1 : end
    )
  );
  let count = 0;

  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      tokens[index].depth !== 0 ||
      !sequenceMatches(tokens, index, ['retainRtlArchitectureMarker', '(', ')'])
    ) {
      continue;
    }

    const previous = tokens[index - 1];
    const next = tokens[index + 3];
    const hasPreviousBoundary =
      !previous ||
      previous.value === ';' ||
      (previous.value === '}' && previous.depth === 0) ||
      (importStatementEnds.has(index - 1) &&
        previous.endLine < tokens[index].line);
    const hasNextBoundary = !next || next.value === ';';
    if (hasPreviousBoundary && hasNextBoundary) {
      count += 1;
    }
  }

  return count;
}

function consumeStaticImport(tokens, start) {
  if (
    tokens[start]?.depth !== 0 ||
    tokens[start]?.type !== 'identifier' ||
    tokens[start]?.value !== 'import' ||
    tokens[start - 1]?.value === '.'
  ) {
    return null;
  }

  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.depth !== 0) {
      continue;
    }
    if (token.type === 'string' && token.completesImportDeclaration === true) {
      return tokens[index + 1]?.value === ';' ? index + 2 : index + 1;
    }
    if (token.value === ';') {
      return null;
    }
  }
  return null;
}

const UNSUPPORTED_TYPE_DECLARATION_NAMES = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function isControlledTypeDeclarationIdentifier(token) {
  return (
    token?.type === 'identifier' &&
    token.depth === 0 &&
    !UNSUPPORTED_TYPE_DECLARATION_NAMES.has(token.value)
  );
}

function consumeGenericParameterSection(tokens, start) {
  if (tokens[start]?.value !== '<' || tokens[start]?.depth !== 0) {
    return null;
  }

  let expectIdentifier = true;
  let sawIdentifier = false;
  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.depth !== 0) {
      return null;
    }
    if (expectIdentifier && isControlledTypeDeclarationIdentifier(token)) {
      sawIdentifier = true;
      expectIdentifier = false;
      continue;
    }
    if (!expectIdentifier && token.value === ',') {
      expectIdentifier = true;
      continue;
    }
    if (!expectIdentifier && token.value === '>') {
      return sawIdentifier ? index + 1 : null;
    }
    return null;
  }
  return null;
}

function consumeTypeAlias(tokens, start) {
  const aliasName = tokens[start + 1];
  if (!isControlledTypeDeclarationIdentifier(aliasName)) {
    return null;
  }

  let cursor = start + 2;
  if (tokens[cursor]?.value === '<') {
    const afterGenerics = consumeGenericParameterSection(tokens, cursor);
    if (afterGenerics === null) {
      return null;
    }
    cursor = afterGenerics;
  }
  if (tokens[cursor]?.value !== '=' || tokens[cursor]?.depth !== 0) {
    return null;
  }

  let sawTypeExpression = false;
  for (let index = cursor + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.depth === 0 && token.value === ';') {
      return sawTypeExpression ? index + 1 : null;
    }
    sawTypeExpression = true;
  }
  return null;
}

function consumeInterfaceDeclaration(tokens, start) {
  const interfaceName = tokens[start + 1];
  if (!isControlledTypeDeclarationIdentifier(interfaceName)) {
    return null;
  }

  let cursor = start + 2;
  if (tokens[cursor]?.value === '<') {
    const afterGenerics = consumeGenericParameterSection(tokens, cursor);
    if (afterGenerics === null) {
      return null;
    }
    cursor = afterGenerics;
  }

  if (tokens[cursor]?.value === 'extends') {
    cursor += 1;
    let angleDepth = 0;
    let sawTypeReference = false;
    for (; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.depth !== 0) {
        continue;
      }
      if (token.value === '<') {
        angleDepth += 1;
        continue;
      }
      if (token.value === '>') {
        angleDepth -= 1;
        if (angleDepth < 0) {
          return null;
        }
        continue;
      }
      if (token.value === '{' && angleDepth === 0) {
        break;
      }
      if (
        token.value === ';' ||
        token.value === '=' ||
        (token.type !== 'identifier' &&
          token.value !== '.' &&
          token.value !== ',')
      ) {
        return null;
      }
      if (token.type === 'identifier') {
        sawTypeReference = true;
      }
    }
    if (!sawTypeReference || angleDepth !== 0) {
      return null;
    }
  }

  if (tokens[cursor]?.value !== '{' || tokens[cursor]?.depth !== 0) {
    return null;
  }
  for (let index = cursor + 1; index < tokens.length; index += 1) {
    if (tokens[index].value === '}' && tokens[index].depth === 0) {
      return tokens[index + 1]?.value === ';' ? index + 2 : index + 1;
    }
  }
  return null;
}

function consumeTypeOnlyDeclaration(tokens, start) {
  let declarationStart = start;
  if (tokens[declarationStart]?.value === 'export') {
    if (
      tokens[declarationStart + 1]?.value !== 'type' &&
      tokens[declarationStart + 1]?.value !== 'interface'
    ) {
      return null;
    }
    declarationStart += 1;
  }

  if (tokens[declarationStart]?.value === 'type') {
    return consumeTypeAlias(tokens, declarationStart);
  }
  if (tokens[declarationStart]?.value === 'interface') {
    return consumeInterfaceDeclaration(tokens, declarationStart);
  }
  return null;
}

function firstRuntimeModuleItemIndex(tokens) {
  let index = 0;
  while (index < tokens.length) {
    const afterImport = consumeStaticImport(tokens, index);
    if (afterImport !== null) {
      index = afterImport;
      continue;
    }

    const afterTypeDeclaration = consumeTypeOnlyDeclaration(tokens, index);
    if (afterTypeDeclaration !== null) {
      index = afterTypeDeclaration;
      continue;
    }
    break;
  }
  return index;
}

function isFirstRuntimeModuleItemRetentionCall(tokens) {
  const index = firstRuntimeModuleItemIndex(tokens);
  return (
    tokens[index]?.depth === 0 &&
    sequenceMatches(tokens, index, [
      'retainRtlArchitectureMarker',
      '(',
      ')',
      ';',
    ])
  );
}

export function findRuntimeRetentionProblems(rtlSource, rootLayout) {
  const findings = [];
  let rtlTokens;
  let rootTokens;
  try {
    rtlTokens = tokenizeExecutableSource(rtlSource);
  } catch (error) {
    findings.push(`lib/rtl.ts cannot be validated safely: ${error.message}`);
  }
  try {
    rootTokens = tokenizeExecutableSource(rootLayout);
  } catch (error) {
    findings.push(
      `app/_layout.tsx cannot be validated safely: ${error.message}`
    );
  }
  if (!rtlTokens || !rootTokens) {
    return findings;
  }

  const canonicalImport = [
    'import',
    'rtlArchitecture',
    'from',
    { type: 'string', value: '@/config/rtlArchitecture.json' },
  ];
  const canonicalMarkerExport = [
    'export',
    'const',
    'RTL_ARCHITECTURE_MARKER',
    '=',
    'rtlArchitecture',
    '.',
    'marker',
  ];
  const canonicalImportMatches = findTopLevelSequences(
    rtlTokens,
    canonicalImport
  );
  const hasCanonicalMarkerDeclaration = hasExactCanonicalMarkerDeclaration(
    rtlTokens,
    canonicalMarkerExport
  );

  if (canonicalImportMatches.length !== 1 || !hasCanonicalMarkerDeclaration) {
    findings.push(
      'lib/rtl.ts must import and export RTL_ARCHITECTURE_MARKER from the canonical data-only config.'
    );
  }

  if (!hasStrictRetentionAssignment(rtlTokens)) {
    findings.push(
      'lib/rtl.ts must contain an executable globalThis retention assignment based on RTL_ARCHITECTURE_MARKER as its only function statement.'
    );
  }

  const rootImport = [
    'import',
    '{',
    'retainRtlArchitectureMarker',
    '}',
    'from',
    { type: 'string', value: '@/lib/rtl' },
  ];
  const rootImportMatches = findTopLevelSequences(rootTokens, rootImport);
  if (rootImportMatches.length !== 1) {
    findings.push(
      'Root layout must import retainRtlArchitectureMarker from the RTL source.'
    );
  }
  const rootCallCount = countModuleScopeRetentionCalls(
    rootTokens,
    rootImportMatches
  );
  const rootCallRequirement =
    'Root layout must execute retainRtlArchitectureMarker() at module scope exactly once';
  if (rootCallCount === 0) {
    findings.push(`${rootCallRequirement}; no qualifying root call was found.`);
  } else if (rootCallCount > 1) {
    findings.push(
      `${rootCallRequirement}; multiple qualifying root calls were found.`
    );
  } else if (!isFirstRuntimeModuleItemRetentionCall(rootTokens)) {
    findings.push(
      `${rootCallRequirement} as the first runtime-executable module statement.`
    );
  }

  return findings;
}

function walkSourcePath(projectRoot, relativePath, files) {
  const absolutePath = path.join(projectRoot, relativePath);
  const stat = fs.statSync(absolutePath);

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      if (entry.name === '__tests__') {
        continue;
      }
      walkSourcePath(projectRoot, path.join(relativePath, entry.name), files);
    }
    return;
  }

  const normalizedPath = normalizePath(relativePath);
  if (SOURCE_EXTENSION_PATTERN.test(normalizedPath)) {
    files.push(normalizedPath);
  }
}

export function readCanonicalRtlContract(projectRoot) {
  const configPath = path.join(projectRoot, RTL_ARCHITECTURE_CONFIG_PATH);
  let config;

  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot read canonical RTL architecture config ${RTL_ARCHITECTURE_CONFIG_PATH}: ${error.message}`
    );
  }

  if (config?.mode !== 'manual') {
    throw new Error(
      `RTL architecture mode must be manual, found ${JSON.stringify(config?.mode)}`
    );
  }
  if (!MANUAL_MARKER_PATTERN.test(config?.marker ?? '')) {
    throw new Error(
      `Canonical RTL architecture marker is wrong: ${JSON.stringify(config?.marker)}`
    );
  }

  return Object.freeze({ mode: config.mode, marker: config.marker });
}

export function listRtlSourceFiles(projectRoot) {
  const files = [];
  for (const root of RTL_SOURCE_ROOTS) {
    walkSourcePath(projectRoot, root, files);
  }
  return files.sort();
}

function findStyleName(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const objectStyle = lines[index].match(/^\s*([A-Za-z0-9_]+):\s*\{\s*$/);
    if (objectStyle) {
      return objectStyle[1];
    }
    const constStyle = lines[index].match(
      /^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)[^=]*=\s*\{\s*$/
    );
    if (constStyle) {
      return constStyle[1];
    }
  }
  return '<unknown>';
}

export function findForbiddenRtlPatterns(projectRoot) {
  const findings = [];

  for (const file of listRtlSourceFiles(projectRoot)) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const { label, pattern } of FORBIDDEN_GLOBALS) {
        if (pattern.test(line)) {
          findings.push(`${file}:${index + 1}: ${label}`);
        }
      }
      if (/\bIS_RTL\b/.test(line) && file !== RTL_SOURCE_FILE) {
        findings.push(`${file}:${index + 1}: IS_RTL outside rtl source`);
      }
      if (file !== RTL_SOURCE_FILE) {
        for (const { label, pattern } of RAW_STYLE_PATTERNS) {
          if (pattern.test(line)) {
            const styleName = findStyleName(lines, index);
            const key = `${file}:${styleName}`;
            if (ALLOWED_RAW_STYLE_FINDINGS.has(`${key}:${label}`)) {
              continue;
            }
            if (
              label === 'raw alignSelf flex-start/end' &&
              ALLOWED_END_ALIGNMENT_STYLES.has(key)
            ) {
              continue;
            }
            findings.push(`${file}:${index + 1}: ${label}`);
          }
        }
      }

      if (/^(?:app|components|screens)\//.test(file)) {
        for (const token of RAW_NATIVEWIND_TOKENS) {
          if (line.includes(token)) {
            findings.push(`${file}:${index + 1}: raw NativeWind ${token}`);
          }
        }
        for (const { label, pattern } of END_ALIGNMENT_PATTERNS) {
          if (pattern.test(line)) {
            const styleName = findStyleName(lines, index);
            const key = `${file}:${styleName}`;
            if (!ALLOWED_END_ALIGNMENT_STYLES.has(key)) {
              findings.push(
                `${file}:${index + 1}: unlisted ${label} in ${styleName}`
              );
            }
          }
        }
      }

      if (LTR_STYLE_PATTERN.test(line)) {
        const styleName = findStyleName(lines, index);
        const key = `${file}:${styleName}`;
        if (!ALLOWED_LTR_STYLES.has(key)) {
          findings.push(
            `${file}:${index + 1}: unlisted LTR island ${styleName}`
          );
        }
      }
    });
  }

  return findings;
}

export function findVisibleHebrewProblems(projectRoot) {
  const findings = [];

  for (const file of listRtlSourceFiles(projectRoot)) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const match of line.match(HEBREW_ESCAPE) ?? []) {
        const isRegexSyntax = HEBREW_REGEX_ESCAPE_CONTEXTS.some(
          (context) => context.file === file && context.pattern.test(line)
        );
        if (!ALLOWED_ESCAPES.has(match) && !isRegexSyntax) {
          findings.push(`${file}:${index + 1}: visible Hebrew escape ${match}`);
        }
      }
      if (MOJIBAKE_MARKERS.some((pattern) => pattern.test(line))) {
        findings.push(`${file}:${index + 1}: common UTF-8 mojibake marker`);
      }
    });
  }

  return findings;
}
