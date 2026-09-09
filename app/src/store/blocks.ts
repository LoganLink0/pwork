import { create } from 'zustand'
import { assignBlockProfile, listBlocks, saveBlock, softDeleteBlock, type SaveBlockInput } from '../db/blocksRepo'
import type { DataBlock } from '../types/models'

/** 外部数据块状态（输出模块拥有）：报告/朗读/PPT 管线引用 */
interface BlocksState {
  blocks: DataBlock[]
  loaded: boolean
  load: () => Promise<void>
  save: (input: SaveBlockInput) => Promise<DataBlock>
  remove: (id: string) => Promise<void>
  assignProfile: (id: string, profileId: string | undefined) => Promise<void>
}

export const useBlocks = create<BlocksState>((set) => ({
  blocks: [],
  loaded: false,
  load: async () => {
    set({ blocks: await listBlocks(), loaded: true })
  },
  save: async (input) => {
    const block = await saveBlock(input)
    set({ blocks: await listBlocks() })
    return block
  },
  remove: async (id) => {
    await softDeleteBlock(id)
    set({ blocks: await listBlocks() })
  },
  assignProfile: async (id, profileId) => {
    await assignBlockProfile(id, profileId)
    set({ blocks: await listBlocks() })
  },
}))
