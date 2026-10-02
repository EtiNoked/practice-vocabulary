import { describe, expect, it } from 'vitest'
import { readDrillPrefs, writeDrillPrefs } from './drillPrefs'

describe('drill preferences per list', () => {
  it('defaults to random order and no word on screen', () => {
    expect(readDrillPrefs('l1')).toEqual({ ordering: 'random', showWord: false })
  })

  it('remembers each list separately', () => {
    writeDrillPrefs('l1', { ordering: 'list', showWord: true })
    expect(readDrillPrefs('l1')).toEqual({ ordering: 'list', showWord: true })
    expect(readDrillPrefs('l2')).toEqual({ ordering: 'random', showWord: false })
  })

  it('reads anything unexpected as the defaults', () => {
    localStorage.setItem('pvt.drill.prefs.l3', '{"ordering":"sideways","showWord":"yes"}')
    expect(readDrillPrefs('l3')).toEqual({ ordering: 'random', showWord: false })
    localStorage.setItem('pvt.drill.prefs.l4', 'not json')
    expect(readDrillPrefs('l4')).toEqual({ ordering: 'random', showWord: false })
  })
})
