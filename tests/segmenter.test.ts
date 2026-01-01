import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../lib/hash';
import { splitHtmlToSegments } from '../lib/segmenter';

describe('splitHtmlToSegments', () => {
  it('splits block elements into deterministic segments', () => {
    const html = `
      <section>
        <h1>Title goes here</h1>
        <p>First block text.</p>
        <p>Second block.</p>
        <blockquote>Quoted text for testing.</blockquote>
      </section>
    `;

    const segments = splitHtmlToSegments(html);
    const expectedTexts = [
      'Title goes here',
      'First block text.',
      'Second block.',
      'Quoted text for testing.',
    ];

    expect(segments).toHaveLength(expectedTexts.length);
    expect(segments.map((segment) => segment.text)).toEqual(expectedTexts);
    expect(segments.map((segment) => segment.id)).toEqual(
      expectedTexts.map((text) => sha256Hex(text).slice(0, 16)),
    );
  });

  it('deduplicates identical segments while preserving first occurrence order', () => {
    const html = `
      <section>
        <p>Hello world</p>
        <p>Hello world</p>
        <p>Second</p>
      </section>
    `;

    const segments = splitHtmlToSegments(html);
    expect(segments.map((s) => s.text)).toEqual(['Hello world', 'Second']);

    const ids = segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
