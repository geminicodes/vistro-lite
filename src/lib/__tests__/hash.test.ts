import { describe, it, expect } from 'vitest';
import { sha256 } from '../hash';

describe('hash', () => {
  describe('sha256', () => {
    it('should generate consistent hash for same input', async () => {
      const text = 'Hello, world!';
      const hash1 = await sha256(text);
      const hash2 = await sha256(text);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should generate different hashes for different inputs', async () => {
      const hash1 = await sha256('Hello');
      const hash2 = await sha256('World');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should generate 64-character hex string', async () => {
      const hash = await sha256('Test');
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
    
    it('should handle empty string', async () => {
      const hash = await sha256('');
      
      expect(hash).toHaveLength(64);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });
});
