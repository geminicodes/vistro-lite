// Mock DeepL translation - simulates translation by adding locale prefix
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<string> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simple mock: add locale prefix to show "translation"
  const prefix = `[${targetLang.toUpperCase()}] `;
  return prefix + text;
}

export function detectLanguage(text: string): string {
  // Simple heuristic: check for common English words
  const englishWords = ['the', 'is', 'and', 'to', 'a', 'of', 'in', 'for'];
  const lowerText = text.toLowerCase();
  const hasEnglish = englishWords.some(word => lowerText.includes(` ${word} `));
  
  // TODO: Implement proper language detection
  return hasEnglish ? 'en' : 'en'; // Default to 'en' for MVP
}
