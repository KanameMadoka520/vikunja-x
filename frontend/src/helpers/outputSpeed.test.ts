import {describe, expect, it} from 'vitest'
import type {ModelStep} from '@/client/generated'
import {outputSpeed} from './outputSpeed'

const response: ModelStep = {streaming: true, duration_ms: 3000, first_token_ms: 1000, first_text_ms: 1500, usage: {reported: true, output: 101}}

describe('per-response output speed', () => {
 it('excludes prefill and the first token from decode speed', () => {
  expect(outputSpeed(response)).toEqual({rate: 50, mode: 'stream', tokens: 101, durationMs: 2000})
 })
 it('accepts a real first delta at zero milliseconds', () => {
  expect(outputSpeed({...response, first_token_ms: 0})).toMatchObject({rate: 100 / 3, durationMs: 3000})
 })
 it('uses only reported visible tokens if reasoning was hidden', () => {
  expect(outputSpeed({...response, usage: {...response.usage, reasoning: 25, reasoning_reported: true}})).toEqual({rate: 50, mode: 'visible', tokens: 76, durationMs: 1500})
 })
 it('includes streamed reasoning in the matching generation interval', () => {
  expect(outputSpeed({...response, reasoning: 'streamed thinking', usage: {...response.usage, reasoning: 25, reasoning_reported: true}})).toMatchObject({rate: 50, mode: 'stream'})
 })
 it('labels non-streaming as request average and includes waiting', () => {
  expect(outputSpeed({...response, streaming: false})).toEqual({rate: 101 / 3, mode: 'request', tokens: 101, durationMs: 3000})
 })
 it('never estimates tokens from text or incomplete usage', () => {
  for (const usage of [undefined, {reported: false, output: 101}, {reported: true}, {reported: true, output: 101, partial: true}, {reported: true, output: -1}, {reported: true, output: 101, reasoning_reported: true, reasoning: 102}]) {
   expect(outputSpeed({...response, text: 'a'.repeat(4000), usage})).toMatchObject({rate: null, reason: 'usage'})
  }
 })
 it('does not invent a generation interval for missing or invalid timings', () => {
  for (const first_token_ms of [undefined, null, -1, 3000, 4000, NaN]) expect(outputSpeed({...response, first_token_ms})).toMatchObject({rate: null, reason: 'timing'})
  expect(outputSpeed({...response, streaming: undefined})).toMatchObject({rate: null})
  expect(outputSpeed({...response, duration_ms: 0})).toMatchObject({rate: null})
 })
 it('cannot derive decode speed from zero or one output token', () => {
  for (const output of [0, 1]) expect(outputSpeed({...response, usage: {reported: true, output}})).toMatchObject({rate: null, reason: 'short'})
 })
 it('does not use late text arrival as the first tool-argument token', () => {
  expect(outputSpeed({...response, tool_calls: [{id: 'tool', function: {name: 'list_tasks', arguments: '{}'}}]})).toMatchObject({rate: null, reason: 'tools'})
 })
})
