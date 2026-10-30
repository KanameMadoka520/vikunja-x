import {describe, expect, it} from 'vitest'
import {projectCalendar} from './projectCalendar'

describe('project calendar', () => {
 it('keeps leap day, year boundaries and unique days without DST gaps', () => {
  const days = projectCalendar(2024)
  expect(days).toHaveLength(366)
  expect(days[0]).toMatchObject({date: '2024-01-01', weekday: 0, week: 0})
  expect(days.at(-1)?.date).toBe('2024-12-31')
  expect(days.some(d => d.date === '2024-02-29')).toBe(true)
  expect(new Set(days.map(d => d.date)).size).toBe(366)
  expect(projectCalendar(2023)).toHaveLength(365)
  expect(projectCalendar(2023)[0]).toMatchObject({weekday: 6, week: 0})
 })
})
