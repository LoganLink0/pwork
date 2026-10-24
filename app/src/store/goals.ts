import { create } from 'zustand'
import { createGoal, listAllGoals, setGoalStatus, updateDue, updateGoalTitle, updateProgress, type CreateGoalInput } from '../db/goalsRepo'
import type { Goal } from '../types/models'

interface GoalsState {
  goals: Goal[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: CreateGoalInput) => Promise<void>
  setStatus: (id: string, status: Goal['status']) => Promise<void>
  updateProgress: (id: string, progressNote: string) => Promise<void>
  updateDue: (id: string, due: string | undefined) => Promise<void>
  /** 行内编辑标题（空标题不生效） */
  updateTitle: (id: string, title: string) => Promise<void>
}

export const useGoals = create<GoalsState>((set) => ({
  goals: [],
  loaded: false,
  load: async () => {
    set({ goals: await listAllGoals(), loaded: true })
  },
  create: async (input) => {
    await createGoal(input)
    set({ goals: await listAllGoals() })
  },
  setStatus: async (id, status) => {
    await setGoalStatus(id, status)
    set({ goals: await listAllGoals() })
  },
  updateProgress: async (id, progressNote) => {
    await updateProgress(id, progressNote)
    set({ goals: await listAllGoals() })
  },
  updateDue: async (id, due) => {
    await updateDue(id, due)
    set({ goals: await listAllGoals() })
  },
  updateTitle: async (id, title) => {
    await updateGoalTitle(id, title)
    set({ goals: await listAllGoals() })
  },
}))
