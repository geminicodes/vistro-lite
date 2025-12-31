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

  it('does not extract script/style content and extracts common attributes', () => {
    const html = `
      <div>
        <script>console.log("do not translate")</script>
        <style>.x { content: "do not translate"; }</style>
        <p title="Greeting title">Hello <span aria-label="Accessible label">world</span></p>
        <input placeholder="Your name" />
        <img alt="Alt text" />
      </div>
    `;

    const segments = splitHtmlToSegments(html);
    const texts = segments.map((s) => s.text);

    expect(texts).toContain('Hello world');
    expect(texts).toContain('Greeting title');
    expect(texts).toContain('Accessible label');
    expect(texts).toContain('Your name');
    expect(texts).toContain('Alt text');
    expect(texts.join(' ')).not.toMatch(/do not translate/i);
  });
});
