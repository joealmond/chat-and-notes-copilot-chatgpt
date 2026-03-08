import { describe, expect, it } from 'vitest'
import { getHeadingOutline, getReadingMinutes, getWordCount } from './note-metadata'

const markdown = `# Weekly Plan

Ship the drag and drop workflow.

## Details

- Add presence
- Add public metadata
`

describe('note metadata helpers', () => {
  it('counts words from markdown content', () => {
    expect(getWordCount(markdown)).toBeGreaterThan(5)
  })

  it('estimates reading time in minutes', () => {
    expect(getReadingMinutes(markdown)).toBe(1)
  })

  it('extracts heading outline entries', () => {
    expect(getHeadingOutline(markdown)).toEqual([
      { level: 1, title: 'Weekly Plan' },
      { level: 2, title: 'Details' },
    ])
  })
})