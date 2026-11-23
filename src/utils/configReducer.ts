import type { GlobalProperties, ManagerMode, ResourceGroup, RgConfig, Selector } from '@/types/model'
import { orderedSelectors } from '@/utils/selectors'
import { buildTree, descendantIds, emptyGroup, newId } from '@/utils/tree'

/** What a change of manager did to the selectors, to be said next to the control. */
export type ManagerSwitchNote = 'prioritiesSet' | 'sorted' | 'sortedTies' | null

/** Priorities that give the list order under the database manager: the first selector the highest, in steps of ten. */
export function prioritiesFromOrder(selectors: readonly Selector[]): Selector[] {
  return selectors.map((selector, index) => ({ ...selector, priority: String(10 * (selectors.length - index)) }))
}

/**
 * Changes the manager without changing the routing. The file manager reads
 * selectors in list order, the database manager by descending priority, so
 * each direction rewrites what the other manager ignores.
 * - File to database: priorities are set from the list order, unless those
 *   already there give that same order without any tie.
 * - Database to file: the list is sorted by descending priority, equal
 *   priorities keeping their list order. Priorities are kept in the model.
 */
export function switchManager(config: RgConfig, mode: ManagerMode): { config: RgConfig; note: ManagerSwitchNote } {
  if (mode === config.mode) return { config, note: null }
  if (mode === 'db') {
    const values = config.selectors.map((selector) => (/^-?\d+$/.test(selector.priority.trim()) ? Number(selector.priority.trim()) : null))
    const alreadyOrdered = values.every((value, index) => value !== null && (index === 0 || value < (values[index - 1] ?? -Infinity)))
    // Nothing is rewritten, so nothing is to be said.
    if (alreadyOrdered) return { config: { ...config, mode }, note: null }
    return { config: { ...config, mode, selectors: prioritiesFromOrder(config.selectors) }, note: config.selectors.length > 0 ? 'prioritiesSet' : null }
  }
  const sorted = orderedSelectors(config)
  const moved = sorted.some((selector, index) => selector !== config.selectors[index])
  const priorities = sorted.map((selector) => selector.priority.trim())
  const ties = new Set(priorities).size < priorities.length
  return { config: { ...config, mode, selectors: sorted }, note: ties ? 'sortedTies' : moved ? 'sorted' : null }
}

export type ConfigAction =
  | { type: 'load'; config: RgConfig }
  | { type: 'updateGroup'; id: string; patch: Partial<ResourceGroup> }
  | { type: 'addGroup'; group: ResourceGroup }
  | { type: 'removeGroup'; id: string }
  | { type: 'moveGroup'; id: string; direction: -1 | 1 }
  | { type: 'reparentGroup'; id: string; parentId: string | null }
  | { type: 'updateGlobal'; patch: Partial<GlobalProperties> }
  | { type: 'setMode'; mode: ManagerMode }
  | { type: 'addSelector'; selector: Selector }
  | { type: 'updateSelector'; id: string; patch: Partial<Selector> }
  | { type: 'removeSelector'; id: string }
  | { type: 'moveSelector'; id: string; direction: -1 | 1 }

function swap<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items]
  const a = copy[from]
  const b = copy[to]
  if (a === undefined || b === undefined) return copy
  copy[from] = b
  copy[to] = a
  return copy
}

export function emptySelector(): Selector {
  return {
    id: newId('s'), groupId: null, unresolvedTarget: '', priority: '', user: '', originalUser: '',
    authenticatedUser: '', userGroup: '', source: '', queryText: '', queryType: '', clientTags: [],
  }
}

/** New group with a name that is free among its future siblings. */
export function makeGroup(state: RgConfig, parentId: string | null, baseName: string): ResourceGroup {
  const siblingNames = new Set(state.groups.filter((group) => group.parentId === parentId).map((group) => group.name))
  let name = baseName
  for (let suffix = 2; siblingNames.has(name); suffix += 1) name = `${baseName}_${suffix}`
  const group: ResourceGroup = { ...emptyGroup(name, parentId), maxQueued: '100', hardConcurrencyLimit: '10' }
  const parent = state.groups.find((candidate) => candidate.id === parentId)
  if (parent) group.environment = parent.environment
  return group
}

/** Pure state transitions of the editor. Invalid moves return the state unchanged. */
export function configReducer(state: RgConfig, action: ConfigAction): RgConfig {
  switch (action.type) {
    case 'load':
      return action.config
    case 'updateGroup':
      return {
        ...state,
        groups: state.groups.map((group) => (group.id === action.id ? { ...group, ...action.patch } : group)),
      }
    case 'addGroup':
      return { ...state, groups: [...state.groups, action.group] }
    case 'removeGroup': {
      const removed = descendantIds(state.groups, action.id)
      const tree = buildTree(state.groups)
      return {
        ...state,
        groups: state.groups.filter((group) => !removed.has(group.id)),
        // Selectors that targeted a removed group keep its path, so the check can name it.
        selectors: state.selectors.map((selector) =>
          selector.groupId !== null && removed.has(selector.groupId)
            ? { ...selector, groupId: null, unresolvedTarget: tree.byId.get(selector.groupId)?.path ?? '' }
            : selector,
        ),
      }
    }
    case 'moveGroup': {
      const index = state.groups.findIndex((group) => group.id === action.id)
      const current = state.groups[index]
      if (!current) return state
      // Swap with the nearest sibling in the requested direction.
      for (let other = index + action.direction; other >= 0 && other < state.groups.length; other += action.direction) {
        if (state.groups[other]?.parentId === current.parentId) {
          return { ...state, groups: swap(state.groups, index, other) }
        }
      }
      return state
    }
    case 'reparentGroup': {
      // A group cannot become its own descendant: that would create a cycle.
      if (action.parentId !== null && descendantIds(state.groups, action.id).has(action.parentId)) return state
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === action.id ? { ...group, parentId: action.parentId, missingParentDbId: null } : group,
        ),
      }
    }
    case 'updateGlobal':
      return { ...state, global: { ...state.global, ...action.patch } }
    case 'setMode':
      return switchManager(state, action.mode).config
    case 'addSelector':
      return { ...state, selectors: [...state.selectors, action.selector] }
    case 'updateSelector':
      return {
        ...state,
        selectors: state.selectors.map((selector) => (selector.id === action.id ? { ...selector, ...action.patch } : selector)),
      }
    case 'removeSelector':
      return { ...state, selectors: state.selectors.filter((selector) => selector.id !== action.id) }
    case 'moveSelector': {
      const index = state.selectors.findIndex((selector) => selector.id === action.id)
      const target = index + action.direction
      if (index < 0 || target < 0 || target >= state.selectors.length) return state
      return { ...state, selectors: swap(state.selectors, index, target) }
    }
  }
}
