/**
 * 因果循环图模板库（v2）——"先僵化，后优化，再固化"：
 * 空白画布对新手是灾难，三个起手模板降低启动成本；载入后所有节点/关系都可改。
 */
import type { CldGraph } from '../types/models'

export interface CldTemplate {
  id: string
  name: string
  desc: string
  graph: CldGraph
}

export const CLD_TEMPLATES: CldTemplate[] = [
  {
    id: 'flywheel',
    name: '增长飞轮',
    desc: '好生意都在转圈——把你的 A→B→C→A 找出来（课程 10 讲 Uber 案例）',
    graph: {
      nodes: [
        { id: 'n_demand', label: '更多需求' },
        { id: 'n_driver', label: '更多司机' },
        { id: 'n_cover', label: '更多区域覆盖' },
        { id: 'n_wait', label: '更快接客' },
        { id: 'n_price', label: '更低价格' },
      ],
      edges: [
        { id: 't_e1', from: 'n_driver', to: 'n_cover', polarity: 'enhance' },
        { id: 't_e2', from: 'n_cover', to: 'n_wait', polarity: 'enhance' },
        { id: 't_e3', from: 'n_wait', to: 'n_price', polarity: 'enhance' },
        { id: 't_e4', from: 'n_price', to: 'n_demand', polarity: 'enhance' },
        { id: 't_e5', from: 'n_demand', to: 'n_driver', polarity: 'enhance' },
      ],
      loops: [
        {
          id: 't_loop1',
          nodeIds: ['n_driver', 'n_cover', 'n_wait', 'n_price', 'n_demand'],
          kind: 'reinforcing',
          label: '增长飞轮',
        },
      ],
    },
  },
  {
    id: 'vicious',
    name: '恶性循环',
    desc: '识别让你下沉的环——同一个结构，方向相反，命运相反（课程 15 讲）',
    graph: {
      nodes: [
        { id: 'v_cheap', label: '一味压低价格' },
        { id: 'v_quality', label: '设备/服务质量下降' },
        { id: 'v_fail', label: '故障与投诉变多' },
        { id: 'v_lose', label: '客户流失' },
        { id: 'v_thin', label: '利润更薄' },
      ],
      edges: [
        { id: 'v_e1', from: 'v_cheap', to: 'v_quality', polarity: 'enhance' },
        { id: 'v_e2', from: 'v_quality', to: 'v_fail', polarity: 'enhance' },
        { id: 'v_e3', from: 'v_fail', to: 'v_lose', polarity: 'enhance' },
        { id: 'v_e4', from: 'v_lose', to: 'v_thin', polarity: 'enhance' },
        { id: 'v_e5', from: 'v_thin', to: 'v_cheap', polarity: 'enhance' },
      ],
      loops: [
        {
          id: 'v_loop1',
          nodeIds: ['v_cheap', 'v_quality', 'v_fail', 'v_lose', 'v_thin'],
          kind: 'vicious',
          label: '低价下沉循环',
        },
      ],
    },
  },
  {
    id: 'cost',
    name: '成本优化环',
    desc: '两项调整、净利率 16%→23%（课程 19 讲 F 公司）',
    graph: {
      nodes: [
        { id: 'c_worker', label: '按淡旺季优化工人数量' },
        { id: 'c_space', label: '多余车间出租' },
        { id: 'c_mgmt', label: '管理层级精简' },
        { id: 'c_cost', label: '整体人工成本降低' },
        { id: 'c_profit', label: '净利率提升' },
      ],
      edges: [
        { id: 'c_e1', from: 'c_worker', to: 'c_space', polarity: 'enhance' },
        { id: 'c_e2', from: 'c_space', to: 'c_mgmt', polarity: 'enhance' },
        { id: 'c_e3', from: 'c_mgmt', to: 'c_cost', polarity: 'enhance' },
        { id: 'c_e4', from: 'c_cost', to: 'c_profit', polarity: 'enhance' },
        { id: 'c_e5', from: 'c_profit', to: 'c_worker', polarity: 'enhance' },
      ],
      loops: [
        {
          id: 'c_loop1',
          nodeIds: ['c_worker', 'c_space', 'c_mgmt', 'c_cost', 'c_profit'],
          kind: 'reinforcing',
          label: '降本增效环',
        },
      ],
    },
  },
]
