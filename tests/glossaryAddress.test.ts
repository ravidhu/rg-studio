import { describe, expect, it } from 'vitest'
import { MAX_ADDRESS_SEARCH, canonicalHash, cleanSearch, glossaryHash, parseHash, readAddressSearch } from '@/utils/pages'

describe('glossary search in the address', () => {
  it('reads the tab, the category and the search', () => {
    const tab = parseHash('#glossary/how-it-works?s=schedulingWeight')
    expect(tab).toMatchObject({ page: 'glossary', glossaryTab: 'concepts', glossaryCategory: null, glossarySearch: 'schedulingWeight' })
    const category = parseHash('#glossary/how-it-works/sharing?s=schedulingWeight')
    expect(category).toMatchObject({ glossaryTab: 'concepts', glossaryCategory: 'sharing', glossarySearch: 'schedulingWeight' })
  })

  it('gives an empty search without a question mark', () => {
    expect(parseHash('#glossary/how-it-works').glossarySearch).toBe('')
    expect(parseHash('#glossary/how-it-works/sharing').glossarySearch).toBe('')
  })

  it('rewrites the tab alias and keeps the search', () => {
    expect(canonicalHash(parseHash('#glossary/concepts?s=weight'))).toBe('#glossary/how-it-works?s=weight')
  })

  it('drops the query on other pages', () => {
    const parsed = parseHash('#dashboard?s=x')
    expect(parsed.glossarySearch).toBe('')
    expect(canonicalHash(parsed)).toBe('#group-allocation')
    expect(canonicalHash(parseHash('#configure/groups?s=x'))).toBe('#configure/groups')
  })

  it('reads plus and percent-20 as spaces and trims', () => {
    expect(readAddressSearch('s=cpu+limit')).toBe('cpu limit')
    expect(readAddressSearch('s=cpu%20limit')).toBe('cpu limit')
    expect(readAddressSearch('s=%20%20cpu+++')).toBe('cpu')
  })

  it('rejects malformed percent-encoding', () => {
    for (const raw of ['s=%', 's=%E0%A4%A', 's=%ED%A0%80']) expect(readAddressSearch(raw)).toBe('')
  })

  it('keeps 64 units and rejects 65 or an oversized raw value', () => {
    expect(readAddressSearch(`s=${'a'.repeat(MAX_ADDRESS_SEARCH)}`)).toBe('a'.repeat(MAX_ADDRESS_SEARCH))
    expect(readAddressSearch(`s=${'a'.repeat(MAX_ADDRESS_SEARCH + 1)}`)).toBe('')
    expect(readAddressSearch(`s=${'a'.repeat(MAX_ADDRESS_SEARCH * 12)}`)).toBe('')
  })

  it('rejects control and format characters', () => {
    for (const raw of ['s=%00', 's=a%0Ab', 's=%E2%80%AE', 's=a%E2%80%8Bb']) expect(readAddressSearch(raw)).toBe('')
  })

  it('reads only the first s and drops other parameters from the canonical form', () => {
    expect(readAddressSearch('x=1&s=first&s=second')).toBe('first')
    expect(canonicalHash(parseHash('#glossary/how-it-works?x=1&s=first&s=second&y=2'))).toBe('#glossary/how-it-works?s=first')
  })

  it('rejects a text that cleanSearch would not write', () => {
    expect(cleanSearch('a'.repeat(MAX_ADDRESS_SEARCH + 1))).toBe('')
    expect(glossaryHash('concepts', null, 'bad\nline')).toBe('#glossary/how-it-works')
  })

  it('reads back what the application writes', () => {
    for (const text of ['cpu limit', 'mémoire', 'a&b=c?d/e#f', ' padded ']) {
      for (const category of [null, 'sharing'] as const) {
        expect(parseHash(glossaryHash('concepts', category, text)).glossarySearch).toBe(text.trim())
      }
    }
  })

  it('round-trips HTML-like text as plain text', () => {
    const text = '<img src=x onerror=alert(1)>'
    expect(parseHash(glossaryHash('concepts', null, text)).glossarySearch).toBe(text)
  })

  it('ignores an encoded key and still reads a plain s', () => {
    expect(readAddressSearch('%73=%E0%A4%A&s=ok')).toBe('ok')
    expect(readAddressSearch('%73=x')).toBe('')
  })

  it('rejects unpaired surrogates and separators without throwing', () => {
    expect(cleanSearch('a\uD800')).toBe('')
    const hash = glossaryHash('concepts', null, 'a\uD800')
    expect(hash).not.toContain('?')
    expect(cleanSearch('a\u2028b')).toBe('')
    expect(cleanSearch('a\u2029b')).toBe('')
  })

  it('round-trips a valid surrogate pair', () => {
    const text = 'cpu \u{1F600}'
    expect(cleanSearch(text)).toBe(text)
    expect(parseHash(glossaryHash('concepts', null, text)).glossarySearch).toBe(text)
  })
})
