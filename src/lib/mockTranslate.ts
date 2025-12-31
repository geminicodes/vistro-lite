import { z } from 'zod';
import { sha256 } from './hash';
import { translateText, detectLanguage } from './mockDeepL';

const translateSchema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url().optional(),
  html: z.string().optional(),
  targetLocales: z.array(z.string().min(2)).nonempty(),
}).refine(
  data => (data.url && !data.html) || (!data.url && data.html),
  { message: 'Either url OR html must be provided (not both)' }
);

interface TranslationMemory {
  siteId: string;
  source_lang: string;
  target_lang: string;
  segment_hash: string;
  translated_text: string;
}

interface Segment {
  text: string;
  hash?: string;
  tag?: string;
}

const TRANSLATION_MEMORY_KEY = 'vistro_translation_memory';
const TRANSLATION_JOBS_KEY = 'vistro_translation_jobs';

function getTranslationMemory(): TranslationMemory[] {
  try {
    const stored = localStorage.getItem(TRANSLATION_MEMORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveTranslationMemory(memory: TranslationMemory[]): void {
  localStorage.setItem(TRANSLATION_MEMORY_KEY, JSON.stringify(memory));
}

function getTranslationJobs(): any[] {
  try {
    const stored = localStorage.getItem(TRANSLATION_JOBS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveTranslationJobs(jobs: any[]): void {
  localStorage.setItem(TRANSLATION_JOBS_KEY, JSON.stringify(jobs));
}

// Naive segmenter: split on block-level tags
function segmentHtml(html: string): Segment[] {
  const segments: Segment[] = [];
  
  // Extract text from common block elements and attributes
  const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'div', 'span'];
  
  for (const tag of blockTags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'gi');
    const matches = html.matchAll(regex);
    
    for (const match of matches) {
      const text = match[1].trim();
      if (text && text.length > 0) {
        segments.push({ text, tag });
      }
    }
  }
  
  // Extract alt and title attributes
  const attrRegex = /(alt|title)="([^"]+)"/gi;
  const attrMatches = html.matchAll(attrRegex);
  
  for (const match of attrMatches) {
    const text = match[2].trim();
    if (text && text.length > 0) {
      segments.push({ text, tag: match[1] });
    }
  }
  
  return segments;
}

async function fetchHtmlContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Vistro-Bot/1.0' }
    });
    
    clearTimeout(timeout);
    
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 2 * 1024 * 1024) {
      throw new Error('Response too large (> 2MB)');
    }
    
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) {
      throw new Error('Response too large (> 2MB)');
    }
    
    return text;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function translateSegments(
  segments: Segment[],
  siteId: string,
  sourceLang: string,
  targetLang: string
): Promise<Map<string, string>> {
  const memory = getTranslationMemory();
  const translated = new Map<string, string>();
  const misses: Segment[] = [];
  
  // Compute hashes and check cache
  for (const segment of segments) {
    const hash = await sha256(segment.text);
    segment.hash = hash;
    
    const cached = memory.find(
      m => m.siteId === siteId &&
           m.source_lang === sourceLang &&
           m.target_lang === targetLang &&
           m.segment_hash === hash
    );
    
    if (cached) {
      translated.set(segment.text, cached.translated_text);
    } else {
      misses.push(segment);
    }
  }
  
  // Translate cache misses
  if (misses.length > 0) {
    for (const segment of misses) {
      const translatedText = await translateText(segment.text, targetLang, sourceLang);
      translated.set(segment.text, translatedText);
      
      // Add to translation memory
      memory.push({
        siteId,
        source_lang: sourceLang,
        target_lang: targetLang,
        segment_hash: segment.hash!,
        translated_text: translatedText,
      });
    }
    
    saveTranslationMemory(memory);
  }
  
  return translated;
}

function reconstructHtml(html: string, translations: Map<string, string>): string {
  let result = html;
  
  for (const [original, translated] of translations.entries()) {
    // Simple replace - in production, use proper DOM manipulation
    result = result.replace(original, translated);
  }
  
  return result;
}

export async function mockTranslateApi(body: unknown) {
  // Validate request
  const parsed = translateSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0].message,
      status: 400
    };
  }
  
  const { siteId, url, html, targetLocales } = parsed.data;
  
  try {
    // Fetch or use provided HTML
    let content: string;
    if (url) {
      content = await fetchHtmlContent(url);
    } else {
      content = html!;
    }
    
    // Check size
    if (content.length > 2 * 1024 * 1024) {
      return {
        error: 'Content too large (> 2MB)',
        status: 413
      };
    }
    
    // Segment HTML
    const segments = segmentHtml(content);
    
    // Detect source language (simple heuristic)
    const sourceLang = segments.length > 0 ? detectLanguage(segments[0].text) : 'en';
    
    // Translate for each locale
    const translatedHtmlByLocale: Record<string, string> = {};
    
    for (const locale of targetLocales) {
      const translations = await translateSegments(segments, siteId, sourceLang, locale);
      translatedHtmlByLocale[locale] = reconstructHtml(content, translations);
    }
    
    // Create job record
    const jobId = crypto.randomUUID();
    const jobs = getTranslationJobs();
    jobs.push({
      id: jobId,
      siteId,
      sourceLang,
      targetLocales,
      segmentCount: segments.length,
      createdAt: new Date().toISOString(),
    });
    saveTranslationJobs(jobs);
    
    return {
      data: {
        jobId,
        translatedHtmlByLocale,
      },
      status: 200
    };
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('too large')) {
      return {
        error: error.message,
        status: 413
      };
    }
    
    return {
      error: error instanceof Error ? error.message : 'Translation failed',
      status: 500
    };
  }
}
