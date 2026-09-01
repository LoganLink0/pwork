import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { EmotionPicker } from './EmotionPicker'
import { useDraft } from '../../store/draft'
import { emptyClap, type ReviewRecord } from '../../types/models'

function seedDraft(): ReviewRecord {
  const now = new Date().toISOString()
  return {
    id: 'rev_emotion_test',
    type: 'personal',
    scenario: 'emotion',
    templateId: 'personal-emotion',
    title: '情绪复盘测试',
    createdAt: now,
    updatedAt: now,
    status: 'in-progress',
    quick: false,
    clap: emptyClap(),
    summary: [],
  }
}

function renderPicker() {
  return render(<EmotionPicker value={useDraft.getState().draft?.clap.comparison.emotion} />)
}

beforeEach(() => {
  cleanup()
  useDraft.setState({ draft: seedDraft(), step: 0 })
})

afterEach(() => {
  cleanup()
})

describe('情绪选择器 · 批量更新竞态回归', () => {
  it('同一批次连点"细分词 + 强度"，两者都持久化（回归：过期闭包覆盖）', async () => {
    renderPicker()
    // 同步块内连点两次——复现旧实现的过期闭包场景
    act(() => {
      const hot = screen.getByRole('button', { name: '恼火' })
      hot.click()
      const i4 = screen.getByRole('radio', { name: '强度 4' })
      i4.click()
    })
    const emotion = useDraft.getState().draft?.clap.comparison.emotion
    expect(emotion?.words).toEqual(['恼火'])
    expect(emotion?.intensity).toBe(4)
  })

  it('再点一次细分词可取消；上限 3 个词', () => {
    renderPicker()
    act(() => {
      screen.getByRole('button', { name: '恼火' }).click()
      screen.getByRole('button', { name: '焦虑' }).click()
      screen.getByRole('button', { name: '失落' }).click()
      screen.getByRole('button', { name: '无力' }).click() // 第 4 个应被拒绝
    })
    let emotion = useDraft.getState().draft?.clap.comparison.emotion
    expect(emotion?.words).toEqual(['恼火', '焦虑', '失落'])
    act(() => {
      screen.getByRole('button', { name: '恼火' }).click()
    })
    emotion = useDraft.getState().draft?.clap.comparison.emotion
    expect(emotion?.words).toEqual(['焦虑', '失落'])
  })

  it('触发点写入并持久化字段完整', () => {
    renderPicker()
    act(() => {
      const input = screen.getByRole('textbox', { name: '情绪触发点' })
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '方案被当众否定')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const emotion = useDraft.getState().draft?.clap.comparison.emotion
    expect(emotion?.trigger).toBe('方案被当众否定')
    expect(useDraft.getState().draft?.clap.comparison.emotion).toBeDefined()
  })
})
