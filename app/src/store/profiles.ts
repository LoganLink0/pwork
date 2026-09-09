import { create } from 'zustand'
import { listProfiles, saveProfile, softDeleteProfile, type SaveProfileInput } from '../db/profilesRepo'
import type { Profile } from '../types/models'

/** 调研对象状态（输入模块拥有）：材料（数据块）挂在对象下，分析产出从对象取材料 */
interface ProfilesState {
  profiles: Profile[]
  loaded: boolean
  load: () => Promise<void>
  save: (input: SaveProfileInput) => Promise<Profile>
  remove: (id: string) => Promise<void>
}

export const useProfiles = create<ProfilesState>((set) => ({
  profiles: [],
  loaded: false,
  load: async () => {
    set({ profiles: await listProfiles(), loaded: true })
  },
  save: async (input) => {
    const profile = await saveProfile(input)
    set({ profiles: await listProfiles() })
    return profile
  },
  remove: async (id) => {
    await softDeleteProfile(id)
    set({ profiles: await listProfiles() })
  },
}))
