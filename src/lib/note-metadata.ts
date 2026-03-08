export function getWordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*|__|~~|[*_]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  if (!text) {
    return 0
  }

  return text.split(/\s+/).filter(Boolean).length
}

export function getReadingMinutes(markdown: string): number {
  const wordCount = getWordCount(markdown)
  return wordCount ? Math.max(1, Math.ceil(wordCount / 200)) : 0
}

export function getHeadingOutline(markdown: string) {
  return markdown
    .split('\n')
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const hashes = match[1] ?? ''
      const title = match[2] ?? ''

      return {
        level: hashes.length,
        title: title.trim(),
      }
    })
}