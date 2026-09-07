import { describe, expect, it } from 'vitest'
import { greeting } from './greeting'

/** A fixed local date, so these read as clock times rather than epoch arithmetic. */
const at = (hour: number, minute = 0) => new Date(2026, 8, 7, hour, minute).getTime()

describe('the time of day', () => {
  it.each([
    [5, 'Good morning'],
    [9, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i:00 it is %s', (hour, expected) => {
    expect(greeting(at(hour))).toBe(expected)
  })

  /*
   * The small hours belong to the night before.
   *
   * 02:00 is not morning to anybody who is awake at it, and "Good morning" is the one
   * greeting that reads as a mistake at that hour rather than as a rounding.
   */
  it.each([0, 3, 4])('at 0%i:00 it is still evening', (hour) => {
    expect(greeting(at(hour))).toBe('Good evening')
  })

  it('turns over exactly on the hour, not a minute either side', () => {
    expect(greeting(at(11, 59))).toBe('Good morning')
    expect(greeting(at(12, 0))).toBe('Good afternoon')
    expect(greeting(at(17, 59))).toBe('Good afternoon')
    expect(greeting(at(18, 0))).toBe('Good evening')
  })

  /*
   * LOCAL hours, like `dayLabel`. A UTC reading would greet a user in Auckland with
   * "Good evening" over breakfast, and the bug would be invisible to anyone developing
   * in London.
   */
  it('reads the local clock', () => {
    const noon = new Date(2026, 8, 7, 12, 0)
    expect(greeting(noon.getTime())).toBe(`Good afternoon`)
    expect(noon.getHours()).toBe(12)
  })
})

describe('the name', () => {
  it('greets a signed-in user by their first name', () => {
    expect(greeting(at(9), 'Eti Dahan Noked')).toBe('Good morning, Eti')
  })

  it('takes a single-word name as it stands', () => {
    expect(greeting(at(9), 'Eti')).toBe('Good morning, Eti')
  })

  /*
   * Guests are the DEFAULT, not an edge case: the local-only build has no accounts at
   * all. No name means no comma and no placeholder — never "Hello there", and never the
   * email address `AccountMenu` falls back to, which is a poor thing to put in 24pt on a
   * shared screen.
   */
  it.each([undefined, null, '', '   '])('says nothing about a name it does not have (%s)', (name) => {
    expect(greeting(at(9), name)).toBe('Good morning')
  })

  it('tolerates a name padded or double-spaced by whatever provided it', () => {
    expect(greeting(at(9), '  Eti   Dahan  ')).toBe('Good morning, Eti')
  })
})
