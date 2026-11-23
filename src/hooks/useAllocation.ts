import { useMemo } from 'react'
import { allocate, type Allocation } from '@/utils/allocation'
import { leavesOf, type GroupTree } from '@/utils/tree'

/**
 * Slots of every group of every root when every leaf group has queries
 * waiting: the contention case, where weights and hard limits decide.
 */
export function useAllocation(tree: GroupTree): Allocation {
  return useMemo(() => {
    const merged: Allocation = { slots: new Map(), usable: new Map() }
    for (const root of tree.roots) {
      const demand = new Map(leavesOf(root).map((leaf) => [leaf.group.id, Infinity]))
      const result = allocate(root, demand)
      result.slots.forEach((value, id) => merged.slots.set(id, value))
      result.usable.forEach((value, id) => merged.usable.set(id, value))
    }
    return merged
  }, [tree])
}
