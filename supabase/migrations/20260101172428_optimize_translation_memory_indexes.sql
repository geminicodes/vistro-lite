/*
  # Optimize Translation Memory for Cache Performance

  ## Changes
  1. Add segment_hash column (SHA-256 of source_text)
     - Stored as generated column for consistency
     - Eliminates runtime hashing overhead
  
  2. Replace MD5-based indexes with SHA-256 based indexes
     - MD5 is cryptographically weak
     - SHA-256 reduces collision probability
  
  3. Unique constraint on (segment_hash, source_lang, target_lang)
     - Prevents duplicate cache entries
     - Composite key ensures language pair uniqueness
  
  4. Optimized lookup index
     - Composite index on (segment_hash, source_lang, target_lang)
     - Enables single index scan for cache hits
     - Covers most common query pattern

  ## Performance Impact
  - Cache lookups: O(1) via unique index
  - Duplicate prevention: Database-enforced
  - Storage: +32 bytes per row for SHA-256 hash
*/

-- ============================================================================
-- ADD SEGMENT_HASH COLUMN
-- ============================================================================

-- Add segment_hash as a generated column (SHA-256 of source_text)
-- Stored computation eliminates runtime hashing overhead
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'translation_memory' AND column_name = 'segment_hash'
  ) THEN
    ALTER TABLE translation_memory
    ADD COLUMN segment_hash text
    GENERATED ALWAYS AS (encode(sha256(source_text::bytea), 'hex')) STORED;
  END IF;
END $$;

-- ============================================================================
-- DROP OLD MD5-BASED INDEXES
-- ============================================================================

-- Remove legacy MD5-based indexes (collision-prone, slower)
DROP INDEX IF EXISTS idx_translation_memory_lookup;
DROP INDEX IF EXISTS idx_translation_memory_unique;
DROP INDEX IF EXISTS idx_translation_memory_usage;

-- ============================================================================
-- CREATE OPTIMIZED INDEXES
-- ============================================================================

-- Unique constraint: Prevents duplicate cache entries
-- Composite key: (segment_hash, source_lang, target_lang)
-- Guarantees one translation per source text + language pair
-- This index also serves as the primary cache lookup index
CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_memory_cache_key
ON translation_memory(segment_hash, source_lang, target_lang);

-- Secondary index: Fast lookups by target language only
-- Use case: "Find all translations into Spanish" (for analytics or batch operations)
CREATE INDEX IF NOT EXISTS idx_translation_memory_target_lang
ON translation_memory(target_lang, segment_hash);

-- Secondary index: Usage tracking for cache eviction strategies
-- Use case: LRU/LFU cache replacement, identifying popular translations
CREATE INDEX IF NOT EXISTS idx_translation_memory_usage
ON translation_memory(usage_count DESC, created_at DESC);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN translation_memory.segment_hash IS 
  'SHA-256 hash of source_text. Generated column for fast cache lookups.';

COMMENT ON INDEX idx_translation_memory_cache_key IS 
  'Primary cache lookup index. Prevents duplicates and enables O(1) cache hits.';

COMMENT ON INDEX idx_translation_memory_target_lang IS 
  'Secondary index for target language queries and analytics.';

COMMENT ON INDEX idx_translation_memory_usage IS 
  'Secondary index for cache eviction and popularity tracking.';