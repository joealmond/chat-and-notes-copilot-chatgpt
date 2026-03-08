import { describe, expect, it } from 'vitest'
import { collectAncestorIds, filterNotesForQuery, flattenVisibleNoteIds, getRecentNotes, type SearchableTreeNote } from './note-tree'

const notes: SearchableTreeNote[] = [
  { _id: 'root-a', title: 'Planning', slug: 'planning', lastEditedAt: 10 },
  { _id: 'child-a1', parentId: 'root-a', title: 'Weekly sync', slug: 'weekly-sync', excerpt: 'Team agenda', lastEditedAt: 40 },
  { _id: 'child-a2', parentId: 'root-a', title: 'Hiring', slug: 'hiring', lastEditedAt: 20 },
  { _id: 'root-b', title: 'Engineering', slug: 'engineering', lastEditedAt: 30 },
]

const rootA = notes[0]!
const childA1 = notes[1]!
const childA2 = notes[2]!
const rootB = notes[3]!

describe('note-tree utils', () => {
  it('collects ancestors from root to parent', () => {
    expect(collectAncestorIds(notes, 'child-a1')).toEqual(['root-a'])
  })

  it('filters matching notes and keeps ancestors visible', () => {
    const result = filterNotesForQuery(notes, 'weekly')

    expect(result.notes.map((note) => note._id)).toEqual(['root-a', 'child-a1'])
    expect(result.matchedIds.has('child-a1')).toBe(true)
    expect(result.autoExpandedIds.has('root-a')).toBe(true)
  })

  it('flattens only expanded branches in visible order', () => {
    const notesByParent = new Map<string, SearchableTreeNote[]>([
      ['root', [rootA, rootB]],
      ['root-a', [childA1, childA2]],
    ])

    expect(flattenVisibleNoteIds(notesByParent, { 'root-a': true })).toEqual(['root-a', 'child-a1', 'child-a2', 'root-b'])
    expect(flattenVisibleNoteIds(notesByParent, { 'root-a': false })).toEqual(['root-a', 'root-b'])
  })

  it('returns recently edited notes first', () => {
    expect(getRecentNotes(notes, 2).map((note) => note._id)).toEqual(['child-a1', 'root-b'])
  })
})