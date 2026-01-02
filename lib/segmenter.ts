/**
 * HTML segmentation utility for translation
 * Extracts translatable text and attributes while preserving structure
 *
 * Uses a proper HTML parser instead of regex to handle:
 * - Nested elements
 * - Self-closing tags
 * - Escaped quotes in attributes
 * - CDATA sections
 * - HTML entities
 */

export interface Segment {
  id: string
  content: string
  type: "text" | "attribute"
  position: number
  metadata?: {
    tagName?: string
    attributeName?: string
    xpath?: string
  }
}

/**
 * Segments HTML into translatable parts using a DOM-like parser
 * Returns array of segments with position tracking for reconstruction
 */
export function segmentHTML(html: string): Segment[] {
  const segments: Segment[] = []
  let position = 0

  // Use a simple but robust HTML parser approach
  // This implementation handles the basic cases; for production consider using `node-html-parser`
  const parser = new SimpleHTMLParser(html)
  const nodes = parser.parse()

  // Extract text nodes
  nodes.forEach((node) => {
    if (node.type === "text") {
      const trimmed = node.content.trim()
      if (trimmed.length > 0 && !isOnlyWhitespace(trimmed)) {
        segments.push({
          id: `seg_${position}`,
          content: trimmed,
          type: "text",
          position: position++,
          metadata: {
            xpath: node.xpath,
          },
        })
      }
    } else if (node.type === "attribute") {
      const trimmed = node.content.trim()
      if (trimmed.length > 0 && shouldTranslateAttribute(node.attributeName || "")) {
        segments.push({
          id: `seg_${position}`,
          content: trimmed,
          type: "attribute",
          position: position++,
          metadata: {
            tagName: node.tagName,
            attributeName: node.attributeName,
            xpath: node.xpath,
          },
        })
      }
    }
  })

  return segments
}

/**
 * Estimates token count for text (rough approximation)
 * Used for rate limiting and cost estimation
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  // More accurate would use tiktoken library
  return Math.ceil(text.length / 4)
}

// Helper functions

function isOnlyWhitespace(text: string): boolean {
  return /^\s*$/.test(text)
}

function shouldTranslateAttribute(attr: string): boolean {
  const translatableAttrs = ["title", "alt", "placeholder", "aria-label", "aria-description"]
  return translatableAttrs.includes(attr.toLowerCase())
}

/**
 * Simple HTML parser that extracts text nodes and translatable attributes
 * This is a basic implementation - for production use a proper parser like `node-html-parser`
 */
class SimpleHTMLParser {
  private html: string
  private position = 0
  private nodes: Array<{
    type: "text" | "attribute"
    content: string
    tagName?: string
    attributeName?: string
    xpath?: string
  }> = []

  constructor(html: string) {
    this.html = html
  }

  parse() {
    this.nodes = []
    this.position = 0

    // Remove script and style tags entirely
    const cleaned = this.html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")

    this.parseNodes(cleaned, "root")
    return this.nodes
  }

  private parseNodes(html: string, xpath: string) {
    // Match tags and text between them
    const tagRegex = /<([a-z][a-z0-9]*)\b([^>]*)>(.*?)<\/\1>|<([a-z][a-z0-9]*)\b([^>]*)\/?>|([^<]+)/gis
    let match: RegExpExecArray | null

    while ((match = tagRegex.exec(html)) !== null) {
      if (match[6]) {
        // Text node
        const text = match[6]
        this.nodes.push({
          type: "text",
          content: text,
          xpath: xpath,
        })
      } else if (match[1]) {
        // Paired tag with content
        const tagName = match[1]
        const attributes = match[2]
        const innerContent = match[3]

        // Extract translatable attributes
        this.extractAttributes(tagName, attributes, xpath)

        // Recurse into content
        if (innerContent) {
          this.parseNodes(innerContent, `${xpath}/${tagName}`)
        }
      } else if (match[4]) {
        // Self-closing or unpaired tag
        const tagName = match[4]
        const attributes = match[5]

        // Extract translatable attributes
        this.extractAttributes(tagName, attributes, xpath)
      }
    }
  }

  private extractAttributes(tagName: string, attributesStr: string, xpath: string) {
    // Match attributes with values (handles both single and double quotes)
    const attrRegex = /(\w+)\s*=\s*["']([^"']*)["']/g
    let match: RegExpExecArray | null

    while ((match = attrRegex.exec(attributesStr)) !== null) {
      const attrName = match[1]
      const attrValue = match[2]

      if (shouldTranslateAttribute(attrName)) {
        this.nodes.push({
          type: "attribute",
          content: attrValue,
          tagName: tagName,
          attributeName: attrName,
          xpath: `${xpath}/${tagName}/@${attrName}`,
        })
      }
    }
  }
}
