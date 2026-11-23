import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { allocate, displaySlots, explainShares, roundKeepingSum, walkLevel } from '@/utils/allocation'
import { DEMO_JSON } from '@/utils/demo'
import { clusterSlots, parentMarker } from '@/utils/dashboard'
import { buildSunburst } from '@/utils/sunburst'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { buildTree, leavesOf, type TreeNode } from '@/utils/tree'
import { WEIGHTED_TREE_JSON } from './fixtures'

function loadRoot(json: string): TreeNode {
  const result = parseResourceGroupsJson(json)
  if (!result.ok) throw new Error('fixture must parse')
  const root = buildTree(result.config.groups).roots[0]
  if (!root) throw new Error('fixture must have a root')
  return root
}

function slotsByName(root: TreeNode, activeLeaves: string[] | 'all', finite: Record<string, number> = {}): Record<string, number> {
  const demand = new Map<string, number>()
  for (const leaf of leavesOf(root)) {
    if (activeLeaves === 'all' || activeLeaves.includes(leaf.group.name)) {
      demand.set(leaf.group.id, finite[leaf.group.name] ?? Infinity)
    }
  }
  const { slots } = allocate(root, demand)
  const names: Record<string, number> = {}
  const visit = (node: TreeNode): void => {
    names[node.group.name] = slots.get(node.group.id) ?? 0
    node.children.forEach(visit)
  }
  visit(root)
  return names
}

describe('allocate', () => {
  const root = loadRoot(WEIGHTED_TREE_JSON)

  it('shares the root by weight and redistributes what capped groups cannot use', () => {
    const slots = slotsByName(root, 'all')
    expect(slots.A1).toBeCloseTo(80)
    expect(slots.A2).toBeCloseTo(40)
    expect(slots.U1).toBeCloseTo(20)
    expect(slots.U2).toBeCloseTo(20)
    expect(slots.U3).toBeCloseTo(20)
    expect(slots.D).toBeCloseTo(20)
    expect(slots.A).toBeCloseTo(120)
    expect(slots.U).toBeCloseTo(60)
    expect(slots.R).toBeCloseTo(200)
  })

  it('lets one branch grow to its own hard limit when it is alone', () => {
    const slots = slotsByName(root, ['U1', 'U2', 'U3'])
    expect(slots.U).toBeCloseTo(80)
    expect(slots.U1).toBeCloseTo(80 / 3)
    expect(slots.U2).toBeCloseTo(80 / 3)
    expect(slots.U3).toBeCloseTo(80 / 3)
    expect(Math.round(slots.U1 ?? 0)).toBe(27)
    expect(slots.A).toBe(0)
    expect(slots.D).toBe(0)
  })

  it('gives a capped sibling its limit and the rest to the other', () => {
    const slots = slotsByName(root, ['A1', 'A2'])
    expect(slots.A).toBeCloseTo(150)
    expect(slots.A1).toBeCloseTo(80)
    expect(slots.A2).toBeCloseTo(70)
  })

  it('never exceeds a finite demand', () => {
    const slots = slotsByName(root, 'all', { A1: 10 })
    expect(slots.A1).toBeCloseTo(10)
    expect(slots.A2).toBeCloseTo(100)
    expect(slots.R).toBeLessThanOrEqual(200)
  })

  it('returns zero everywhere without demand', () => {
    const slots = slotsByName(root, [])
    expect(Object.values(slots).every((value) => value === 0)).toBe(true)
  })

  it('uses equal weights under the fair policy', () => {
    const fair = loadRoot(JSON.stringify({
      rootGroups: [{
        name: 'R', hardConcurrencyLimit: 90, maxQueued: 10, schedulingPolicy: 'fair',
        subGroups: [
          { name: 'X', hardConcurrencyLimit: 90, maxQueued: 10, schedulingWeight: 9 },
          { name: 'Y', hardConcurrencyLimit: 90, maxQueued: 10, schedulingWeight: 1 },
          { name: 'Z', hardConcurrencyLimit: 10, maxQueued: 10 },
        ],
      }],
    }))
    const slots = slotsByName(fair, 'all')
    expect(slots.Z).toBeCloseTo(10)
    expect(slots.X).toBeCloseTo(40)
    expect(slots.Y).toBeCloseTo(40)
  })

  it('adds the hard limits of independent roots into the cluster slots', () => {
    const result = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [
        { name: 'x', hardConcurrencyLimit: 30, maxQueued: 1 },
        { name: 'y', hardConcurrencyLimit: 10, maxQueued: 1 },
      ],
    }))
    if (!result.ok) throw new Error('fixture must parse')
    expect(clusterSlots(buildTree(result.config.groups))).toBe(40)
  })

  it('draws the slots chart on one denominator at every level: the slots that the parent receives', () => {
    const demand = new Map(leavesOf(root).map((leaf) => [leaf.group.id, Infinity]))
    const allocation = allocate(root, demand)
    const width = (chart: ReturnType<typeof buildSunburst>, name: string): number => {
      const arc = chart.arcs.find((candidate) => candidate.node?.group.name === name)
      return arc ? arc.end - arc.start : 0
    }
    const child = (parent: TreeNode, name: string): TreeNode => {
      const found = parent.children.find((candidate) => candidate.group.name === name)
      if (!found) throw new Error(`no group ${name}`)
      return found
    }
    const top = buildSunburst(root, 'slots', allocation)
    expect(top.total).toBe(200)
    expect(width(top, 'A')).toBeCloseTo(120 / 200)
    expect(width(top, 'A1')).toBeCloseTo(80 / 200)
    // Opened, a group is the whole circle for the slots it receives (120), not for its hard limit (150).
    const zoomed = buildSunburst(child(root, 'A'), 'slots', allocation)
    expect(zoomed.total).toBe(120)
    expect(width(zoomed, 'A1')).toBeCloseTo(80 / 120)
    expect(width(zoomed, 'A2')).toBeCloseTo(40 / 120)
    // Shown as whole queries, sub-groups still add up to the figure shown for their parent.
    expect(roundKeepingSum([33.4, 33.3, 33.3], 100)).toEqual([34, 33, 33])
    expect(roundKeepingSum([0.5, 0.5, 9], 10)).toEqual([1, 0, 9])
    const thirds = parseResourceGroupsJson(JSON.stringify({
      rootGroups: [{ name: 'p', hardConcurrencyLimit: 100, maxQueued: 1, subGroups: ['a', 'b', 'c'].map((name) => ({ name, hardConcurrencyLimit: 100, maxQueued: 1 })) }],
    }))
    if (!thirds.ok) throw new Error('fixture must parse')
    const parent = buildTree(thirds.config.groups).roots[0]
    if (!parent) throw new Error('fixture must have a root')
    const shown = displaySlots([parent], allocate(parent, new Map(leavesOf(parent).map((leaf) => [leaf.group.id, Infinity]))))
    expect(parent.children.map((node) => shown.get(node.group.id))).toEqual([34, 33, 33])
    expect(shown.get(parent.group.id)).toBe(100)
    // A group without sub-groups is one full arc: it uses all that it receives.
    const leaf = buildSunburst(child(root, 'D'), 'slots', allocation)
    expect(leaf.total).toBe(20)
    expect(leaf.arcs.map((arc) => [arc.node?.group.name, arc.start, arc.end, arc.value])).toEqual([['D', 0, 1, 20]])
  })

  it('explains a sharing by its steps: the capped sub-group, then the remainder by weight', () => {
    const sample = parseResourceGroupsJson(readFileSync(new URL('./fixtures/samples/current/resource-groups.json', import.meta.url), 'utf8'))
    if (!sample.ok) throw new Error('fixture must parse')
    const core = buildTree(sample.config.groups).roots.find((node) => node.group.name === 'core')
    if (!core) throw new Error('fixture must have the group core')
    const sampleTree = buildTree(sample.config.groups)
    const saturated = allocate(core, new Map(leavesOf(core).map((leaf) => [leaf.group.id, Infinity])))
    // The line across a bar is the limit of the own parent of the group: team_a (420) for alpha, core (840) for team_a.
    const named = (name: string): TreeNode => {
      const found = [...sampleTree.byId.values()].find((node) => node.group.name === name)
      if (!found) throw new Error(`no group ${name}`)
      return found
    }
    expect(parentMarker(named('alpha'), sampleTree, saturated)).toMatchObject({ parent: { group: { name: 'team_a' } }, value: 420, kind: 'hard' })
    expect(parentMarker(named('team_a'), sampleTree, saturated)).toMatchObject({ parent: { group: { name: 'core' } }, value: 840 })
    expect(parentMarker(core, sampleTree, saturated)).toBeNull()
    const steps = explainShares(core, saturated)
    expect(steps.total).toBe(840)
    expect(steps.members.map((member) => [member.node.group.name, member.weight])).toEqual([['pool_x', 7], ['team_a', 22], ['team_b', 58]])
    // pool_x cannot use its weight share: it keeps its hard limit, and the other two split the rest.
    expect(steps.capped.map((member) => [member.node.group.name, member.slots, member.hard])).toEqual([['pool_x', 45, true]])
    expect(steps.remainder).toBe(795)
    expect(steps.sharers.map((member) => member.node.group.name)).toEqual(['team_a', 'team_b'])
    expect(steps.sharers.map((member) => member.slots / steps.remainder)).toEqual([22 / 80, 58 / 80].map((share) => expect.closeTo(share, 6)))
  })

  it('walks the built-in example in the figures shown: 50, 30 and 20 by weight, then 40, 36 and 24 once etl is capped', () => {
    const global = loadRoot(DEMO_JSON)
    const allocation = allocate(global, new Map(leavesOf(global).map((leaf) => [leaf.group.id, Infinity])))
    const walk = walkLevel(global, allocation, displaySlots([global], allocation))
    expect(walk.total).toBe(100)
    expect(walk.weighted).toBe(true)
    expect(walk.members.map((member) => [member.node.group.name, member.weight, member.first, member.final, member.cap])).toEqual([
      ['etl', 50, 50, 40, 'hard'],
      ['bi', 30, 30, 36, null],
      ['adhoc', 20, 20, 24, null],
    ])
    expect(walk.surplus).toBe(10)
    expect(walk.idle).toEqual([])
  })
})
