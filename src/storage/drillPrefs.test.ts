import { describe, expect, it } from 'vitest'
import { readDrillPrefs, writeDrillPrefs } from './drillPrefs'

describe('drill preferences per list', () => {
  it('defaults to random order and listening', () => {
    expect(readDrillPrefs('l1')).toEqual({ ordering: 'random', prompt: 'hear' })
  })

  it('remembers each list separately', () => {
    writeDrillPrefs('l1', { ordering: 'list', prompt: 'see' })
    expect(readDrillPrefs('l1')).toEqual({ ordering: 'list', prompt: 'see' })
    expect(readDrillPrefs('l2')).toEqual({ ordering: 'random', prompt: 'hear' })
  })

  it('reads anything unexpected as the defaults', () => {
    localStorage.setItem('pvt.drill.prefs.l3', '{"ordering":"sideways","prompt":"shouted"}')
    expect(readDrillPrefs('l3')).toEqual({ ordering: 'random', prompt: 'hear' })
    localStorage.setItem('pvt.drill.prefs.l4', 'not json')
    expect(readDrillPrefs('l4')).toEqual({ ordering: 'random', prompt: 'hear' })
  })

  /*
   * A preference written while this was a checkbox must survive it becoming three
   * buttons. `true` meant "say it AND show it" and `false` meant "say it" — 'both' and
   * 'hear'. Dropping to the default instead would silently reset the one setting this
   * change touched, for everyone who had already made it.
   */
  it('carries a choice made while it was a checkbox', () => {
    localStorage.setItem('pvt.drill.prefs.old-on', '{"ordering":"random","showWord":true}')
    expect(readDrillPrefs('old-on').prompt).toBe('both')

    localStorage.setItem('pvt.drill.prefs.old-off', '{"ordering":"list","showWord":false}')
    expect(readDrillPrefs('old-off')).toEqual({ ordering: 'list', prompt: 'hear' })
  })
})
