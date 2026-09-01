import { create } from 'zustand'
import { createGoal, listAllGoals, setGoalStatus, type CreateGoalInput } from '../db/goalsRepo'
import type { Goal } from '../types/models'

interface GoalsState {
  goals: Goal[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: CreateGoalInput) => Promise<void>
  setStatus: (id: string, status: Goal['status']) => Promise<void>
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
}))
