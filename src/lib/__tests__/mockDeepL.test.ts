import { describe, it, expect, vi } from 'vitest';
import { translateText, detectLanguage } from '../mockDeepL';

describe('mockDeepL', () => {
  describe('translateText', () => {
    it('should add locale prefix to simulate translation', async () => {
      const result = await translateText('Hello world', 'es');
      
      expect(result).toBe('[ES] Hello world');
    });
    
    it('should handle different target languages', async () => {
      const resultFr = await translateText('Hello', 'fr');
      const resultDe = await translateText('Hello', 'de');
      
      expect(resultFr).toBe('[FR] Hello');
      expect(resultDe).toBe('[DE] Hello');
    });
    
    it('should simulate API delay', async () => {
      const start = Date.now();
      await translateText('Test', 'es');
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });
  
  describe('detectLanguage', () => {
    it('should detect English text', () => {
      const result = detectLanguage('This is the beginning of something');
      
      expect(result).toBe('en');
    });
    
    it('should default to English for unknown text', () => {
      const result = detectLanguage('Texto aleatorio sin palabras comunes');
      
      expect(result).toBe('en');
    });
    
    it('should handle empty string', () => {
      const result = detectLanguage('');
      
      expect(result).toBe('en');
    });
  });
});
