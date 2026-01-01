'use server';

import { sha256Hex } from './hash';

type HtmlNodeLike = {
  rawTagName?: string;
  parentNode?: HtmlNodeLike | null;
  childNodes?: HtmlNodeLike[];
  text?: string;
  textContent?: string;
  innerText?: string;
};

export interface HtmlSegment {
  id: string;
  text: string;
  selector?: string;
}

const TARGET_TAGS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figcaption']);
const MIN_SEGMENT_LENGTH = 3;

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const getNodeText = (node: HtmlNodeLike): string => {
  const candidate =
    (typeof node.text === 'string' && node.text) ||
    (typeof node.textContent === 'string' && node.textContent) ||
    (typeof node.innerText === 'string' && node.innerText) ||
    '';
  return collapseWhitespace(candidate);
};

const isElementNode = (node: HtmlNodeLike): boolean => Boolean(node && typeof node.rawTagName === 'string' && node.rawTagName);

const getTagName = (node: HtmlNodeLike): string => (node.rawTagName ?? '').toLowerCase();

const getNthOfType = (node: HtmlNodeLike): number => {
  const parent = node.parentNode;
  if (!parent || !Array.isArray(parent.childNodes)) {
    return 1;
  }

  const tag = getTagName(node);
  if (!tag) {
    return 1;
  }

  let index = 0;
  for (const sibling of parent.childNodes) {
    if (!isElementNode(sibling)) {
      continue;
    }
    if (getTagName(sibling) !== tag) {
      continue;
    }
    index += 1;
    if (sibling === node) {
      return index;
    }
  }

  return 1;
};

const buildSelector = (node: HtmlNodeLike): string | undefined => {
  const parts: string[] = [];
  let current: HtmlNodeLike | null | undefined = node;

  while (current) {
    const tag = getTagName(current);
    if (!tag) {
      break;
    }

    const nth = getNthOfType(current);
    parts.push(nth > 1 ? `${tag}:nth-of-type(${nth})` : tag);
    current = current.parentNode ?? null;
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.reverse().join(' > ');
};

const traverseDepthFirst = (node: HtmlNodeLike, onVisit: (node: HtmlNodeLike) => void): void => {
  if (!node) {
    return;
  }

  onVisit(node);

  if (!Array.isArray(node.childNodes) || node.childNodes.length === 0) {
    return;
  }

  for (const child of node.childNodes) {
    traverseDepthFirst(child, onVisit);
  }
};

/**
 * Split HTML into deterministic, stable text segments.
 *
 * Extracts text from: p, li, h1-h6, blockquote, figcaption.
 * Segments are ordered in document order.
 *
 * TODO: inject `data-vistro-id="<segment.id>"` attributes into source HTML for
 *       precise reassembly and future-proof DOM addressing.
 */
export const splitHtmlToSegments = (html: string): HtmlSegment[] => {
  if (!html || !html.trim()) {
    return [];
  }

  // Requirement: use node-html-parser.
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const { parse } = require('node-html-parser') as { parse: (html: string, options?: any) => HtmlNodeLike };

  const root = parse(html, {
    lowerCaseTagName: true,
    comment: false,
  });

  const segments: HtmlSegment[] = [];
  const seen = new Set<string>(); // de-dup by id (derived from normalized text)

  traverseDepthFirst(root, (node) => {
    const tag = getTagName(node);
    if (!tag || !TARGET_TAGS.has(tag)) {
      return;
    }

    const text = getNodeText(node);
    if (text.length < MIN_SEGMENT_LENGTH) {
      return;
    }

    const id = sha256Hex(text).slice(0, 16);
    if (seen.has(id)) {
      return;
    }

    seen.add(id);
    segments.push({
      id,
      text,
      selector: buildSelector(node),
    });
  });

  return segments;
};
