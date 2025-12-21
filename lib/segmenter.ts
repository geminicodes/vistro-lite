'use server';

import { sha256Hex } from './hash';

const MIN_SEGMENT_LENGTH = 3;
const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'figcaption',
]);
const ATTRIBUTE_KEYS = ['alt', 'title'] as const;

interface HtmlNodeLike {
  rawTagName?: string;
  rawAttrs?: string;
  innerText?: string;
  textContent?: string;
  rawText?: string;
  childNodes?: HtmlNodeLike[];
  getAttribute?: (name: string) => string | undefined;
}

interface ParserModule {
  parse: (html: string) => HtmlNodeLike;
}

interface SelectorContext {
  parent?: SelectorContext;
  tagName: string;
  index: number;
}

export interface HtmlSegment {
  id: string;
  selector?: string;
  text: string;
}

let cachedParser: ParserModule | null | undefined;

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const extractAttributeFromRaw = (rawAttrs: string | undefined, key: string): string | undefined => {
  if (!rawAttrs) {
    return undefined;
  }

  const pattern = new RegExp(`${key}\\s*=\\s*"([^"]+)"`, 'i');
  const match = pattern.exec(rawAttrs);
  return match ? match[1] : undefined;
};

const getParser = (): ParserModule | null => {
  if (cachedParser !== undefined) {
    return cachedParser;
  }

  try {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const moduleRef = require('node-html-parser') as ParserModule;
    cachedParser = moduleRef;
  } catch {
    cachedParser = null;
  }

  return cachedParser;
};

const getNodeText = (node: HtmlNodeLike): string => {
  if (typeof node.innerText === 'string' && node.innerText.length > 0) {
    return node.innerText;
  }

  if (typeof node.textContent === 'string' && node.textContent.length > 0) {
    return node.textContent;
  }

  if (typeof node.rawText === 'string' && node.rawText.length > 0) {
    return node.rawText;
  }

  if (Array.isArray(node.childNodes)) {
    return node.childNodes.map(getNodeText).join(' ');
  }

  return '';
};

const buildSelector = (context: SelectorContext | undefined): string | undefined => {
  if (!context) {
    return undefined;
  }

  const parts: string[] = [];
  let current: SelectorContext | undefined = context;

  while (current) {
    if (!current.tagName) {
      break;
    }

    const suffix = current.index > 0 ? `:nth-of-type(${current.index})` : '';
    parts.push(`${current.tagName}${suffix}`);
    current = current.parent;
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.reverse().join(' > ');
};

const addAttributeSegments = (
  node: HtmlNodeLike,
  selector: string | undefined,
  segments: HtmlSegment[],
): void => {
  for (const attributeKey of ATTRIBUTE_KEYS) {
    const attributeValue =
      node.getAttribute?.(attributeKey) ?? extractAttributeFromRaw(node.rawAttrs, attributeKey);

    if (!attributeValue) {
      continue;
    }

    const text = collapseWhitespace(attributeValue);

    if (text.length < MIN_SEGMENT_LENGTH) {
      continue;
    }

    const id = sha256Hex(text).slice(0, 16);
    const attributeSelector = selector ? `${selector}::attr(${attributeKey})` : undefined;

    segments.push({
      id,
      selector: attributeSelector,
      text,
    });
  }
};

const addSegment = (
  segments: HtmlSegment[],
  text: string,
  selector: string | undefined,
): void => {
  const normalized = collapseWhitespace(text);

  if (normalized.length < MIN_SEGMENT_LENGTH) {
    return;
  }

  segments.push({
    id: sha256Hex(normalized).slice(0, 16),
    selector,
    text: normalized,
  });
};

const traverseNode = (
  node: HtmlNodeLike,
  context: SelectorContext | undefined,
  segments: HtmlSegment[],
): void => {
  const tagName = node.rawTagName?.toLowerCase() ?? '';

  if (tagName && BLOCK_TAGS.has(tagName)) {
    const text = getNodeText(node);
    const selector = buildSelector(context);
    addSegment(segments, text, selector);
  }

  if (tagName) {
    const selector = buildSelector(context);
    addAttributeSegments(node, selector, segments);
  }

  if (!Array.isArray(node.childNodes) || node.childNodes.length === 0) {
    return;
  }

  const counters = new Map<string, number>();

  for (const child of node.childNodes) {
    const childTag = child.rawTagName?.toLowerCase() ?? '';
    let nextContext = context;

    if (childTag) {
      const count = (counters.get(childTag) ?? 0) + 1;
      counters.set(childTag, count);
      nextContext = {
        parent: context,
        tagName: childTag,
        index: count,
      };
    }

    traverseNode(child, nextContext, segments);
  }
};

const stripTags = (snippet: string): string => snippet.replace(/<[^>]+>/g, ' ');

const fallbackParse = (html: string): HtmlSegment[] => {
  const segments: HtmlSegment[] = [];
  const blockRegex =
    /<\s*(p|h[1-6]|li|blockquote|figcaption)[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const text = collapseWhitespace(stripTags(match[2]));
    addSegment(segments, text, undefined);
  }

  const attributeRegex = /\b(alt|title)\s*=\s*"([^"]+)"/gi;

  while ((match = attributeRegex.exec(html)) !== null) {
    const text = collapseWhitespace(match[2]);
    addSegment(segments, text, undefined);
  }

  return segments;
};

/**
 * Split loosely structured HTML into deterministic text segments.
 *
 * Segmentation prioritises block-level tags and select descriptive attributes.
 * The approach is heuristic, so expect occasional false positives or merged
 * snippets for unusual markup. TODO: enrich selector generation with more
 * precise DOM context to improve worker traceability.
 *
 * @param html - Raw HTML string.
 * @returns Ordered segments including SHA-256 identifiers.
 */
export const splitHtmlToSegments = (html: string): HtmlSegment[] => {
  if (!html || !html.trim()) {
    return [];
  }

  const parser = getParser();

  if (parser) {
    try {
      const root = parser.parse(html);
      const segments: HtmlSegment[] = [];

      traverseNode(
        root,
        undefined,
        segments,
      );

      if (segments.length > 0) {
        return segments;
      }
    } catch {
      // Intentionally fall back to regex parser below.
    }
  }

  return fallbackParse(html);
};
