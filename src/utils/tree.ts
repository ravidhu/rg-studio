import type { ResourceGroup, RgConfig } from '@/types/model'

export interface TreeNode {
  group: ResourceGroup
  depth: number
  children: TreeNode[]
  /** Dot-separated path from the root, as used by selectors in the JSON file. */
  path: string
}

export interface GroupTree {
  /** Groups with no parent, plus orphans, which are shown as detached roots. */
  roots: TreeNode[]
  byId: Map<string, TreeNode>
  /** Groups that are part of a parent cycle and so belong to no tree. */
  cyclic: ResourceGroup[]
  /** Groups whose parent does not exist. */
  orphanIds: Set<string>
}

/**
 * Builds the group forest. Never loops: groups in a parent cycle are
 * unreachable from any root and are returned separately.
 */
export function buildTree(groups: readonly ResourceGroup[]): GroupTree {
  const known = new Set(groups.map((group) => group.id))
  const childrenOf = new Map<string, ResourceGroup[]>()
  const rootGroups: ResourceGroup[] = []
  const orphanIds = new Set<string>()
  for (const group of groups) {
    const isOrphan =
      group.missingParentDbId !== null || (group.parentId !== null && !known.has(group.parentId))
    if (isOrphan) orphanIds.add(group.id)
    if (group.parentId === null || isOrphan) {
      rootGroups.push(group)
    } else {
      const siblings = childrenOf.get(group.parentId) ?? []
      siblings.push(group)
      childrenOf.set(group.parentId, siblings)
    }
  }
  const byId = new Map<string, TreeNode>()
  const build = (group: ResourceGroup, depth: number, parentPath: string): TreeNode => {
    const path = parentPath === '' ? group.name : `${parentPath}.${group.name}`
    const node: TreeNode = { group, depth, children: [], path }
    byId.set(group.id, node)
    for (const child of childrenOf.get(group.id) ?? []) {
      node.children.push(build(child, depth + 1, path))
    }
    return node
  }
  const roots = rootGroups.map((group) => build(group, 0, ''))
  const cyclic = groups.filter((group) => !byId.has(group.id))
  return { roots, byId, cyclic, orphanIds }
}

/** Depth-first list of every node of the forest. */
export function flattenTree(roots: readonly TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  const visit = (node: TreeNode): void => {
    out.push(node)
    node.children.forEach(visit)
  }
  roots.forEach(visit)
  return out
}

export function leavesOf(node: TreeNode): TreeNode[] {
  return flattenTree([node]).filter((candidate) => candidate.children.length === 0)
}

/** Identifiers of a group and all its descendants (cycle-safe). */
export function descendantIds(groups: readonly ResourceGroup[], rootId: string): Set<string> {
  const found = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const group of groups) {
      if (group.parentId !== null && found.has(group.parentId) && !found.has(group.id)) {
        found.add(group.id)
        grew = true
      }
    }
  }
  return found
}

let idCounter = 0

/**
 * Keeps new identifiers clear of those of a configuration restored from the
 * browser: the counter moves past the highest number that they carry.
 */
export function reserveIds(ids: readonly string[]): void {
  for (const id of ids) {
    const number = Number(/(\d+)$/.exec(id)?.[1] ?? 0)
    if (Number.isSafeInteger(number) && number > idCounter) idCounter = number
  }
}

/** New internal identifier, unique in the page: a counter is enough. */
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}${idCounter}`
}

export function emptyGroup(name: string, parentId: string | null): ResourceGroup {
  return {
    id: newId('g'),
    dbId: null,
    name,
    parentId,
    missingParentDbId: null,
    environment: '',
    softMemoryLimit: '',
    maxQueued: '',
    softConcurrencyLimit: '',
    hardConcurrencyLimit: '',
    schedulingPolicy: '',
    schedulingWeight: '',
    jmxExport: '',
    softCpuLimit: '',
    hardCpuLimit: '',
    hardPhysicalDataScanLimit: '',
  }
}

export function emptyConfig(): RgConfig {
  return {
    mode: 'file',
    externalGroups: [],
    ownership: null,
    groups: [],
    selectors: [],
    global: { cpuQuotaPeriod: '', physicalDataScanQuotaPeriod: '' },
  }
}

/** Resolves a dot-separated selector target such as `global.etl` to a node. */
export function resolvePath(tree: GroupTree, path: string): TreeNode | null {
  for (const node of tree.byId.values()) {
    if (node.path === path) return node
  }
  return null
}
