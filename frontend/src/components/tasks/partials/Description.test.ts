import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createPinia} from 'pinia'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'
import {taskKeys, normalizeTask} from '@/client/queries/tasks'
import {failTaskDetails} from '@/client/queries/taskCache'
import {removeToken, saveToken} from '@/helpers/auth'

const sdk = vi.hoisted(() => ({patchTasksRead: vi.fn(), tasksRead: vi.fn()}))
vi.mock('@/client/generated', async original => ({...await original<typeof import('@/client/generated')>(), ...sdk}))
vi.mock('@/message', () => ({error: vi.fn(), success: vi.fn(), getErrorText: (e: Error) => e.message}))
vi.mock('vue-router', async original => ({...await original<typeof import('vue-router')>(), onBeforeRouteLeave: vi.fn()}))
vi.mock('vue-i18n', async original => ({...await original<typeof import('vue-i18n')>(), useI18n: () => ({t: (key: string) => key})}))
vi.mock('@/components/input/AsyncEditor', async () => {
 const {defineComponent} = await import('vue')
 return {default: defineComponent({
 props: ['modelValue'], emits: ['update:modelValue', 'save'],
 template: '<div><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/><button @click="$emit(\'save\')">Save</button></div>',
})}
})
import Description from './Description.vue'

let wrapper: VueWrapper | undefined
let client: QueryClient
function setup() {
 client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}})
 const task = normalizeTask({id: 1, project_id: 1, title: 'Test', description: 'old', attachments: []})
 client.setQueryData(taskKeys.detail(1), task)
 sdk.tasksRead.mockResolvedValue({data: task})
 wrapper = mount(Description, {props: {modelValue: task, canWrite: true}, global: {plugins: [createPinia(), [VueQueryPlugin, {queryClient: client}]], stubs: {Icon: true, CustomTransition: true}, mocks: {$t: (key: string) => key}}})
 return wrapper
}
afterEach(async () => {wrapper?.unmount(); await flushPromises(); vi.clearAllMocks()})

describe('description save races', () => {
 it('retains newer typing while an earlier save is pending and writes only the description', async () => {
  let resolve!: (value: unknown) => void
  sdk.patchTasksRead.mockImplementationOnce(() => new Promise(done => {resolve = done})).mockResolvedValue({data: {id: 1, description: 'newer'}})
  const view = setup()
  await view.find('textarea').setValue('first')
  await view.find('.tiptap__task-description button').trigger('click')
  await flushPromises()
  await view.find('textarea').setValue('newer')
  resolve({data: {id: 1, description: 'first'}})
  await flushPromises()
  expect(view.find('textarea').element.value).toBe('newer')
  await view.find('.tiptap__task-description button').trigger('click')
  await flushPromises()
  expect(sdk.patchTasksRead).toHaveBeenCalledTimes(2)
  expect(sdk.patchTasksRead.mock.calls[0][0].body).toEqual([{op: 'add', path: '/description', value: 'first'}])
  expect(sdk.patchTasksRead.mock.calls[1][0].body).toEqual([{op: 'add', path: '/description', value: 'newer'}])
 })
 it('keeps failed text available for retry', async () => {
  sdk.patchTasksRead.mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue({data: {id: 1, description: 'keep me'}})
  const view = setup()
  await view.find('textarea').setValue('keep me')
  await view.find('.tiptap__task-description button').trigger('click')
  await flushPromises()
  expect(view.find('[role="alert"]').text()).toContain('Save failed')
  expect(view.find('textarea').element.value).toBe('keep me')
  await view.find('.tiptap__task-description button').trigger('click')
  await flushPromises()
  expect(sdk.patchTasksRead).toHaveBeenCalledTimes(2)
  expect(view.find('[role="alert"]').exists()).toBe(false)
 })
 it('does not save a draft of a task deleted elsewhere when it unmounts', async () => {
  const view = setup()
  await view.find('textarea').setValue('unsaved draft')
  failTaskDetails(client, 1)
  view.unmount()
  wrapper = undefined
  await flushPromises()
  expect(sdk.patchTasksRead).not.toHaveBeenCalled()
 })
 it('saves a task with a deleted id again after another login on the same client', async () => {
  const token = (id: number) => `header.${btoa(JSON.stringify({id, type: 1}))}.signature`
  saveToken(token(1), false)
  sdk.patchTasksRead.mockResolvedValue({data: {id: 1, description: 'other server'}})
  const view = setup()
  failTaskDetails(client, 1)
  removeToken()
  saveToken(token(2), false)
  await view.find('textarea').setValue('other server')
  await view.find('.tiptap__task-description button').trigger('click')
  await flushPromises()
  expect(sdk.patchTasksRead).toHaveBeenCalledTimes(1)
  removeToken()
 })
})
