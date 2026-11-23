import type { DashboardScope } from '@/components/dashboard/scope'
import { useI18n } from '@/hooks/useI18n'
import { hardLimitOf, walkLevel, type LevelWalk } from '@/utils/allocation'
import { clusterSlots } from '@/utils/dashboard'
import { parentOf } from '@/utils/resolve'
import type { TreeNode } from '@/utils/tree'

/** At most this many sub-groups get a line about their own ring, so the example stays short. */
const MAX_NEXT_RINGS = 2

/**
 * Worked example of the simultaneous queries chart, written with the figures
 * that the card shows for its current centre: where the figure of the centre
 * comes from, how the sub-groups would share it, which ones are capped and
 * who gets what they leave. Every number is the whole number of the side
 * list, so the text and the card never disagree. `centre` is `null` at the
 * level of the whole cluster, where root groups share nothing.
 */
export function useChartWalk(): (scope: DashboardScope, centre: TreeNode | null) => string[] {
  const { t, fill, plural, num } = useI18n()
  const texts = t.dashboard.walk
  const listed = (items: readonly string[]): string =>
    items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} ${t.dashboard.explain.and} ${items[items.length - 1] ?? ''}`
  const pairs = (walk: LevelWalk, value: 'first' | 'final', only?: readonly TreeNode[]): string =>
    listed(walk.members.filter((member) => !only || only.includes(member.node)).map((member) => `${member.node.group.name} ${num(member[value])}`))

  return (scope, centre) => {
    if (centre === null) {
      return [fill(texts.cluster, {
        roots: listed(scope.tree.roots.map((root) => `${root.group.name} ${num(hardLimitOf(root))}`)),
        total: num(clusterSlots(scope.tree)),
      })]
    }
    const slotsOf = (node: TreeNode): number => scope.allocation.slots.get(node.group.id) ?? 0
    const name = centre.group.name
    const parent = parentOf(centre, scope.tree)
    const walk = walkLevel(centre, scope.allocation, scope.shown)
    // Same reading as the line under the figure of the centre.
    const origin =
      slotsOf(centre) >= hardLimitOf(centre) - 1e-6
        ? texts.origin.own
        : parent && slotsOf(centre) < (scope.allocation.usable.get(centre.group.id) ?? 0) - 1e-6
          ? fill(texts.origin.parent, { parent: parent.group.name })
          : texts.origin.sub
    const lines = [fill(plural(walk.total, texts.centre), { group: name, origin })]
    const capText = (member: LevelWalk['members'][number]): string =>
      fill(member.cap === 'hard' ? texts.capHard : texts.capSub, { group: member.node.group.name, final: num(member.final) })

    if (centre.children.length === 0) {
      lines.push(fill(texts.leaf, { group: name }))
      return lines
    }
    const idle = (): void => {
      if (walk.idle.length > 0) lines.push(fill(plural(walk.idle.length, texts.idle), { groups: listed(walk.idle.map((node) => node.group.name)) }))
    }
    const capped = walk.members.filter((member) => member.cap !== null)
    const sharers = walk.members.filter((member) => member.cap === null)
    if (walk.members.length === 0) {
      lines.push(texts.noneActive)
      return lines
    }
    if (walk.members.length === 1) {
      const only = walk.members[0]
      if (only) lines.push(fill(texts.single, { group: only.node.group.name, final: num(only.final) }) + (only.cap === null ? '' : ` ${capText(only)}.`))
    } else if (sharers.length === 0) {
      lines.push(fill(texts.allServed, { finals: pairs(walk, 'final') }))
    } else {
      const stage = capped.length > 0 ? 'first' : 'final'
      if (walk.weighted) {
        lines.push(fill(texts.byWeight[stage], {
          members: listed(walk.members.map((member) => fill(texts.memberWeight, { group: member.node.group.name, weight: num(member.weight) }))),
          sum: `${walk.members.map((member) => num(member.weight)).join(' + ')} = ${num(walk.members.reduce((sum, member) => sum + member.weight, 0))}`,
          shares: pairs(walk, 'first'),
        }))
        const zero = walk.members.filter((member) => member.weight === 0)
        if (zero.length > 0 && zero.length < walk.members.length) {
          lines.push(fill(plural(zero.length, texts.zeroWeight), { groups: listed(zero.map((member) => member.node.group.name)) }))
        }
      } else {
        lines.push(fill(texts.equal[stage], { group: name, members: listed(walk.members.map((member) => member.node.group.name)), shares: pairs(walk, 'first') }))
      }
      if (capped.length > 0) {
        const finals = pairs(walk, 'final', sharers.map((member) => member.node))
        const how = sharers.length < 2 ? '' : walk.weighted ? texts.howWeights : texts.howEqual
        const tail = walk.surplus > 0
          ? fill(plural(walk.surplus, texts.surplus), { sharers: listed(sharers.map((member) => member.node.group.name)), how, finals })
          : fill(texts.noSurplus, { finals })
        lines.push(`${capped.map(capText).join(t.dashboard.explain.join)}${texts.capJoin}${tail}`)
      }
    }
    idle()
    // The next ring follows the same rule: one short line for the first sub-groups that have their own.
    for (const member of walk.members.filter((candidate) => candidate.node.children.length > 0).slice(0, MAX_NEXT_RINGS)) {
      const next = walkLevel(member.node, scope.allocation, scope.shown)
      if (next.members.length > 0) lines.push(fill(texts.next, { group: member.node.group.name, total: num(member.final), finals: pairs(next, 'final') }))
    }
    return lines
  }
}
