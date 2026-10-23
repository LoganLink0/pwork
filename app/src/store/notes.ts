import { create } from 'zustand'
import {
  createNote,
  listActiveNotes,
  listDeletedNotes,
  purgeNote,
  purgeOldDeletedNotes,
  restoreNote,
  softDeleteNote,
  updateNoteFields,
  type CreateNoteInput,
} from '../db/repo'
import type { Note } from '../types/models'
import { localDateOf, todayLocal } from '../engine/datetime'

const PURGE_CHECK_KEY = 'pwork-notes-purge-at'
const PURGE_AFTER_DAYS = 30

/**
 * 速记状态（Zustand）：先同步置内存、再异步落库（FUPAN 正面实践延续）。
 * 更新回调永远从 store 最新状态出发，不引用组件闭包（开发复盘 1.2）。
 */
interface NotesState {
  notes: Note[] // 未删除，updatedAt 倒序
  trash: Note[] // 已软删除
  loaded: boolean
  load: () => Promise<void>
  create: (input: CreateNoteInput) => Promise<Note>
  /** 增量更新正文/标题/标签；bumps updatedAt */
  update: (id: string, patch: Partial<Pick<Note, 'body' | 'title' | 'tags'>>) => Promise<void>
  softDelete: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  /** 彻底删除（仅回收站手动触发，先确认） */
  purge: (id: string) => Promise<void>
}

async function reload(): Promise<Pick<NotesState, 'notes' | 'trash'>> {
  const [notes, trash] = await Promise.all([listActiveNotes(), listDeletedNotes()])
  return { notes, trash }
}

export const useNotes = create<NotesState>((set) => ({
  notes: [],
  trash: [],
  loaded: false,

  load: async () => {
    // 回收站 30 天自动清理：每日首次 load 执行一次（记录检查日，避免每次打开都扫）
    if (localStorage.getItem(PURGE_CHECK_KEY) !== todayLocal()) {
      localStorage.setItem(PURGE_CHECK_KEY, todayLocal())
      await purgeOldDeletedNotes(PURGE_AFTER_DAYS)
    }
    set({ ...(await reload()), loaded: true })
  },

  create: async (input) => {
    const note = await createNote(input)
    const { notes, trash } = await reload()
    set({ notes, trash })
    return note
  },

  update: async (id, patch) => {
    // 事务化的读-改-写（repo.updateNoteFields）：从库中最新版本做增量，防连点覆盖
    await updateNoteFields(id, patch)
    const { notes, trash } = await reload()
    set({ notes, trash })
  },

  softDelete: async (id) => {
    await softDeleteNote(id)
    const { notes, trash } = await reload()
    set({ notes, trash })
  },

  restore: async (id) => {
    await restoreNote(id)
    const { notes, trash } = await reload()
    set({ notes, trash })
  },

  purge: async (id) => {
    await purgeNote(id)
    const { notes, trash } = await reload()
    set({ notes, trash })
  },
}))

/** 今日速记数（首页瓦片用） */
export function todayNoteCount(notes: Note[], now = new Date()): number {
  const today = todayLocal(now)
  return notes.filter((n) => localDateOf(n.createdAt) === today).length
}
