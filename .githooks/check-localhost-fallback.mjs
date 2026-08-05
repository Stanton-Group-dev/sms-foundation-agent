#!/usr/bin/env node
/**
 * check-localhost-fallback.mjs — flags an unguarded `X || 'http://localhost:PORT'`
 * fallback (or a bare localhost URL literal used as a fallback default) in staged
 * source files. This is the fleet's third occurrence of this exact bug class
 * (2026-07-08, 2026-07-27, 2026-07-29) — see
 * docs/superpowers/plans/2026-07-29-sso-institutional-guardrails.md for why this
 * lint guard exists instead of (or ahead of) real per-environment credential
 * isolation.
 *
 * Scope: only .ts/.tsx/.js/.jsx files (source, not docs/markdown — a doc's example
 * curl command legitimately says "localhost" and isn't a live code path). Only
 * flags the fallback SHAPE (`localhost` appearing as an alternative/default value
 * in real code, not inside a `//` or `/* * /` comment) — it cannot and does not try
 * to determine whether the surrounding logic actually reaches production; that
 * judgment is the human reviewing the warning's job, same as every other check in
 * this repo's pre-commit hook.
 *
 * Usage: node scripts/check-localhost-fallback.mjs <file1> [file2 ...]
 * Exit code: always 0 (warn-only, per this repo's pre-commit convention) — prints
 * one line per hit to stdout, nothing if clean.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
// Matches `localhost` (optionally with a port) appearing as a fallback/default
// value: after `||`, inside a ternary's branches, or as a bare quoted literal
// assigned to something. `\s+` between the operator and the string allows the
// match to span a line break — this fleet's own prettier config wraps any 3+
// term `||` chain onto multiple lines, and the fallback literal is very
// commonly the wrapped-to line, not the first one. Global + multiline so it
// finds every hit in the file, not just the first. Deliberately permissive (a
// regex, not a parser) — false positives are cheap (a warning, not a block);
// false negatives are the real risk, so this errs toward flagging.
const FALLBACK_PATTERN = /(\|\|\s*|[?:]\s*)['"`]https?:\/\/localhost(:\d+)?/gi;

/** Line number (1-based) of the character at `index` in `content`. */
function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/** True if the match's own line (once trimmed) looks like a `//` or block
 *  comment. Cheap and deliberately imprecise (a regex-based scanner, not a
 *  parser) — same trade-off this file's header already documents: false
 *  positives are cheap, false negatives are the real risk, so this only
 *  suppresses the unambiguous case. */
function isOnCommentLine(content, index) {
  const lineStart = content.lastIndexOf('\n', index) + 1;
  const lineEnd = content.indexOf('\n', index);
  const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function checkFile(path) {
  if (!SOURCE_EXTS.has(extname(path))) return [];
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return []; // file deleted/renamed since staging — nothing to check
  }
  const hits = [];
  for (const match of content.matchAll(FALLBACK_PATTERN)) {
    // Anchor the report at the string literal itself, not the leading operator —
    // when the operator and the literal are split across lines (the wrapped-chain
    // case this rewrite exists for), match.index points at the operator's line,
    // which is a line away from the thing a human actually needs to go look at.
    const literalIndex = match.index + match[1].length;
    if (isOnCommentLine(content, literalIndex)) continue;
    const line = lineNumberAt(content, literalIndex);
    const lineStart = content.lastIndexOf('\n', literalIndex) + 1;
    const lineEnd = content.indexOf('\n', literalIndex);
    const lineText = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
    hits.push(`${path}:${line}: unguarded localhost fallback — ${lineText}`);
  }
  return hits;
}

const files = process.argv.slice(2);
const allHits = files.flatMap(checkFile);
if (allHits.length > 0) {
  console.log(allHits.join('\n'));
}
process.exit(0); // warn-only — never block a commit on this check's own say-so
