import type { CheckCode } from '@/i18n/en'
import type { ClusterSizing, GroupField, RgConfig, Severity } from '@/types/model'
import { QUERY_TYPES, SCHEDULING_POLICIES, SELECTOR_REGEX_FIELDS } from '@/types/model'
import { compileJavaRegex, isCatchAll, orderedSelectors } from '@/utils/selectors'
import { clusterTotals, cpuLimitToVcpus, resolveMemory } from '@/utils/sizing'
import { buildTree, flattenTree, type TreeNode } from '@/utils/tree'
import { parseBoolean, parseDataSize, parseDuration, parseMemoryLimit, parseNonNegativeInteger } from '@/utils/units'

export interface Finding {
  /** Translation key under `checks.messages`. */
  code: CheckCode
  severity: Severity
  groupId: string | null
  selectorId: string | null
  /** Property the finding is about, to focus it in the editor. */
  field: GroupField | 'name' | 'parent' | 'cpuQuotaPeriod' | 'physicalDataScanQuotaPeriod' | null
  params: Record<string, string | number>
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

function isWeightedPolicy(policy: string): boolean {
  const normalized = policy.trim().toLowerCase()
  return normalized === 'weighted' || normalized === 'weighted_fair'
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** Coherence checks of a configuration, most severe first. */
export function runChecks(config: RgConfig, sizing: ClusterSizing): Finding[] {
  const findings: Finding[] = []
  const tree = buildTree(config.groups)
  const nodes = flattenTree(tree.roots)
  const totals = clusterTotals(sizing)
  const period = config.global.cpuQuotaPeriod.trim()
  const periodValid = period !== '' && (parseDuration(period) ?? 0) > 0

  const onGroup = (
    code: CheckCode, severity: Severity, node: TreeNode | null, field: Finding['field'],
    params: Finding['params'] = {},
  ): void => {
    findings.push({
      code, severity, field, selectorId: null,
      groupId: node ? node.group.id : null,
      params: node ? { group: node.path, ...params } : params,
    })
  }

  // Structure: cycles, orphans, names.
  for (const group of tree.cyclic) {
    findings.push({ code: 'cycle', severity: 'error', groupId: group.id, selectorId: null, field: 'parent', params: { group: group.name } })
  }
  for (const node of nodes) {
    if (tree.orphanIds.has(node.group.id)) {
      onGroup('orphan', 'error', node, 'parent', { parent: node.group.missingParentDbId ?? node.group.parentId ?? '' })
    }
    if (node.group.name.trim() === '') onGroup('nameMissing', 'error', node, 'name')
    else if (node.group.name.includes('.')) onGroup('nameHasDot', 'warning', node, 'name')
    if (node.group.name.includes('${')) onGroup('templateName', 'info', node, 'name')
  }
  const siblingSets: TreeNode[][] = [tree.roots, ...nodes.map((node) => node.children)]
  for (const siblings of siblingSets) {
    const seen = new Set<string>()
    for (const node of siblings) {
      if (node.group.name !== '' && seen.has(node.group.name)) onGroup('duplicateSiblingName', 'error', node, 'name')
      seen.add(node.group.name)
    }
  }
  if (config.mode === 'db') {
    const counts = new Map<string, number>()
    for (const node of nodes) counts.set(node.group.name, (counts.get(node.group.name) ?? 0) + 1)
    for (const [name, count] of counts) {
      if (count > 1 && name !== '') onGroup('duplicateNameAcrossTree', 'info', null, null, { name, count })
    }
    const environments = new Set(config.groups.map((group) => group.environment).filter((value) => value !== ''))
    if (environments.size > 1) {
      onGroup('multipleEnvironments', 'warning', null, null, { environments: [...environments].join(', ') })
    }
  }

  // Values of each group.
  for (const node of nodes) {
    const group = node.group
    const integerFields: GroupField[] = ['maxQueued', 'hardConcurrencyLimit', 'softConcurrencyLimit', 'schedulingWeight']
    for (const field of integerFields) {
      const raw = group[field].trim()
      const required = field === 'maxQueued' || field === 'hardConcurrencyLimit'
      if (raw === '') {
        if (required) onGroup('requiredMissing', 'error', node, field, { field })
      } else if (parseNonNegativeInteger(raw) === null) {
        onGroup('unparseable', 'error', node, field, { field, value: raw })
      }
    }
    if (group.schedulingWeight.trim() !== '' && parseNonNegativeInteger(group.schedulingWeight) === 0) {
      onGroup('weightZero', 'warning', node, 'schedulingWeight')
    }
    const memory = group.softMemoryLimit.trim()
    if (memory !== '') {
      const parsed = parseMemoryLimit(memory)
      if (parsed === null) onGroup('unparseable', 'error', node, 'softMemoryLimit', { field: 'softMemoryLimit', value: memory })
      else if (parsed.kind === 'percent' && parsed.percent > 100) onGroup('memoryAbove100', 'error', node, 'softMemoryLimit', { value: memory })
      else if (parsed.kind === 'absolute') {
        const resolved = resolveMemory(memory, totals.queryMemoryGb)
        if (resolved && resolved.gb > totals.queryMemoryGb) {
          onGroup('memoryAboveCluster', 'warning', node, 'softMemoryLimit', { value: memory, cluster: round(totals.queryMemoryGb) })
        }
      }
    }
    for (const field of ['softCpuLimit', 'hardCpuLimit'] as const) {
      const raw = group[field].trim()
      if (raw !== '' && parseDuration(raw) === null) onGroup('unparseable', 'error', node, field, { field, value: raw })
    }
    const scan = group.hardPhysicalDataScanLimit.trim()
    if (scan !== '' && parseDataSize(scan) === null) {
      onGroup('unparseable', 'error', node, 'hardPhysicalDataScanLimit', { field: 'hardPhysicalDataScanLimit', value: scan })
    }
    if (scan !== '' && config.global.physicalDataScanQuotaPeriod.trim() === '') {
      onGroup('scanWithoutPeriod', 'warning', node, 'physicalDataScanQuotaPeriod')
    }
    const policy = group.schedulingPolicy.trim()
    if (policy !== '' && !(SCHEDULING_POLICIES as readonly string[]).includes(policy.toLowerCase())) {
      onGroup('unparseable', 'error', node, 'schedulingPolicy', { field: 'schedulingPolicy', value: policy })
    }
    if (group.jmxExport.trim() !== '' && parseBoolean(group.jmxExport) === null) {
      onGroup('unparseable', 'error', node, 'jmxExport', { field: 'jmxExport', value: group.jmxExport })
    }

    // Soft against hard.
    const hard = parseNonNegativeInteger(group.hardConcurrencyLimit)
    const soft = parseNonNegativeInteger(group.softConcurrencyLimit)
    if (hard !== null && soft !== null && soft > hard) {
      onGroup('softConcurrencyAboveHard', 'error', node, 'softConcurrencyLimit', { soft, hard })
    }
    // A zero hard limit with a zero queue is the usual way to refuse a client, so it is reported as information, not as a mistake.
    if (hard === 0) {
      if (parseNonNegativeInteger(group.maxQueued) === 0) onGroup('groupBlocked', 'info', node, 'hardConcurrencyLimit')
      else onGroup('hardConcurrencyZero', 'warning', node, 'hardConcurrencyLimit')
    }
    const softCpu = parseDuration(group.softCpuLimit)
    const hardCpu = parseDuration(group.hardCpuLimit)
    if (softCpu !== null && group.hardCpuLimit.trim() === '') onGroup('softCpuWithoutHard', 'error', node, 'hardCpuLimit')
    if (softCpu !== null && hardCpu !== null && softCpu > hardCpu) {
      onGroup('softCpuAboveHard', 'error', node, 'softCpuLimit', { soft: group.softCpuLimit, hard: group.hardCpuLimit })
    }
    if ((softCpu !== null || hardCpu !== null) && !periodValid) {
      onGroup('cpuWithoutPeriod', 'error', node, 'cpuQuotaPeriod')
    }
    if (periodValid && hardCpu !== null) {
      const vcpus = cpuLimitToVcpus(group.hardCpuLimit, period)
      if (vcpus !== null && totals.vcpus > 0 && vcpus >= totals.vcpus) {
        onGroup('hardCpuAboveCluster', 'info', node, 'hardCpuLimit', { vcpus: round(vcpus), cluster: totals.vcpus })
      }
    }
  }
  if (period !== '' && !periodValid) {
    onGroup('unparseable', 'error', null, 'cpuQuotaPeriod', { field: 'cpuQuotaPeriod', value: period, group: '' })
  }

  // A period that no group uses is kept and exported, and reported so it can be cleared.
  if (periodValid && !nodes.some((node) => node.group.softCpuLimit.trim() !== '' || node.group.hardCpuLimit.trim() !== '')) {
    onGroup('cpuPeriodUnused', 'info', null, 'cpuQuotaPeriod', { value: period })
  }
  const scanPeriod = config.global.physicalDataScanQuotaPeriod.trim()
  if (scanPeriod !== '' && !nodes.some((node) => node.group.hardPhysicalDataScanLimit.trim() !== '')) {
    onGroup('scanPeriodUnused', 'info', null, 'physicalDataScanQuotaPeriod', { value: scanPeriod })
  }

  // Parent against children.
  for (const node of nodes) {
    if (node.children.length === 0) continue
    const parentHard = parseNonNegativeInteger(node.group.hardConcurrencyLimit)
    const parentQueued = parseNonNegativeInteger(node.group.maxQueued)
    let hardSum = 0
    let queuedSum = 0
    let softCpuSum = 0
    let softCpuCount = 0
    let weighted = 0
    for (const child of node.children) {
      const childHard = parseNonNegativeInteger(child.group.hardConcurrencyLimit)
      const childQueued = parseNonNegativeInteger(child.group.maxQueued)
      hardSum += childHard ?? 0
      queuedSum += childQueued ?? 0
      if (parentHard !== null && childHard !== null && childHard > parentHard) {
        onGroup('childHardAboveParent', 'warning', child, 'hardConcurrencyLimit', { child: childHard, parent: parentHard })
      }
      if (parentQueued !== null && childQueued !== null && childQueued > parentQueued) {
        onGroup('childQueueAboveParent', 'warning', child, 'maxQueued', { child: childQueued, parent: parentQueued })
      }
      const parentMemory = resolveMemory(node.group.softMemoryLimit, totals.queryMemoryGb)
      const childMemory = resolveMemory(child.group.softMemoryLimit, totals.queryMemoryGb)
      if (parentMemory && childMemory && childMemory.gb > parentMemory.gb + 1e-9) {
        onGroup('childMemoryAboveParent', 'warning', child, 'softMemoryLimit', { child: child.group.softMemoryLimit, parent: node.group.softMemoryLimit })
      }
      const childSoftCpu = periodValid ? cpuLimitToVcpus(child.group.softCpuLimit, period) : null
      if (childSoftCpu !== null) {
        softCpuSum += childSoftCpu
        softCpuCount += 1
      }
      if (child.group.schedulingWeight.trim() !== '') weighted += 1
    }
    // A group gets one finding for its sub-group sums: when the running and the queued sums each
    // differ from their limit, one note states both, so a reader does not meet two notes for what
    // reads as a single observation. The four single findings and the four combined ones are all
    // information, so the combined one is never less severe than the notes it replaces.
    const hardDiff = parentHard === null || hardSum === parentHard ? null : { limit: parentHard, state: hardSum > parentHard ? 'above' : 'below' }
    const queueDiff = parentQueued === null || queuedSum === parentQueued ? null : { limit: parentQueued, state: queuedSum > parentQueued ? 'above' : 'below' }
    if (hardDiff !== null && queueDiff !== null) {
      const code = hardDiff.state === 'below'
        ? (queueDiff.state === 'below' ? 'childrenHardQueueSumBelow' : 'childrenHardBelowQueueAbove')
        : (queueDiff.state === 'below' ? 'childrenHardAboveQueueBelow' : 'childrenHardQueueSumAbove')
      onGroup(code, 'info', node, 'hardConcurrencyLimit', {
        running: hardSum, queued: queuedSum, runningLimit: hardDiff.limit, queuedLimit: queueDiff.limit,
      })
    } else if (hardDiff !== null) {
      onGroup(hardDiff.state === 'above' ? 'childrenHardSumAbove' : 'childrenHardSumBelow', 'info', node, 'hardConcurrencyLimit', { sum: hardSum, parent: hardDiff.limit })
    } else if (queueDiff !== null) {
      onGroup(queueDiff.state === 'above' ? 'childrenQueueSumAbove' : 'childrenQueueSumBelow', 'info', node, 'maxQueued', { sum: queuedSum, parent: queueDiff.limit })
    }
    if (softCpuCount > 1) {
      const parentHardCpu = periodValid ? cpuLimitToVcpus(node.group.hardCpuLimit, period) : null
      const ceiling = Math.min(parentHardCpu ?? Infinity, totals.vcpus > 0 ? totals.vcpus : Infinity)
      if (softCpuSum > ceiling + 1e-9) {
        onGroup('siblingSoftCpuSum', 'warning', node, 'softCpuLimit', {
          sum: round(softCpuSum), ceiling: round(ceiling),
          against: parentHardCpu !== null && parentHardCpu <= totals.vcpus ? 'parent' : 'cluster',
        })
      }
    }
    // Weights and policies.
    const policy = node.group.schedulingPolicy.trim().toLowerCase()
    if (isWeightedPolicy(policy)) {
      if (weighted === 0) onGroup('weightsAllMissing', 'info', node, 'schedulingPolicy', { policy })
      else if (weighted < node.children.length) {
        for (const child of node.children) {
          if (child.group.schedulingWeight.trim() === '') onGroup('weightMissing', 'warning', child, 'schedulingWeight', { policy, parent: node.path })
        }
      }
    } else {
      for (const child of node.children) {
        if (child.group.schedulingWeight.trim() !== '') {
          onGroup('weightIgnored', 'warning', child, 'schedulingWeight', { policy: policy === '' ? 'fair' : policy, parent: node.path })
        }
      }
    }
    if (policy === 'query_priority') {
      for (const child of node.children) {
        if (child.group.schedulingPolicy.trim().toLowerCase() !== 'query_priority') {
          onGroup('queryPriorityChildren', 'error', child, 'schedulingPolicy', { parent: node.path })
        }
      }
    }
  }
  for (const root of tree.roots) {
    if (root.group.schedulingWeight.trim() !== '' && !tree.orphanIds.has(root.group.id)) {
      onGroup('weightOnRoot', 'info', root, 'schedulingWeight')
    }
  }
  if (tree.roots.length > 1) {
    let sum = 0
    for (const root of tree.roots) sum += parseNonNegativeInteger(root.group.hardConcurrencyLimit) ?? 0
    onGroup('independentRoots', 'info', null, null, { count: tree.roots.length, sum })
  }

  // JMX export.
  const exported = nodes.filter((node) => parseBoolean(node.group.jmxExport) === true)
  if (exported.length > 0 && exported.length < nodes.length) {
    const missing = nodes.filter((node) => !exported.includes(node))
    // A long list is cut, and the message then says how many groups it leaves out.
    const more = Math.max(0, missing.length - 6)
    onGroup(more > 0 ? 'jmxPartialMore' : 'jmxPartial', 'info', null, 'jmxExport', {
      exported: exported.length, total: nodes.length, more,
      missing: missing.slice(0, 6).map((node) => node.path).join(', '),
    })
  }

  // Selectors.
  const ordered = orderedSelectors(config)
  const onSelector = (code: CheckCode, severity: Severity, selectorId: string, position: number, params: Finding['params'] = {}): void => {
    findings.push({ code, severity, groupId: null, selectorId, field: null, params: { position, ...params } })
  }
  const targeted = new Set<string>()
  let catchAllAt: number | null = null
  const priorities = new Map<string, number>()
  ordered.forEach((selector, index) => {
    const position = index + 1
    const node = selector.groupId === null ? undefined : tree.byId.get(selector.groupId)
    if (!node && config.externalGroups.includes(selector.unresolvedTarget)) {
      // Declared as existing in the database outside the loaded file: its limits are unknown here.
      onSelector('selectorExternalGroup', 'info', selector.id, position, { target: selector.unresolvedTarget })
    } else if (!node) {
      onSelector('selectorMissingGroup', 'error', selector.id, position, { target: selector.unresolvedTarget })
    } else {
      targeted.add(node.group.id)
      if (node.children.length > 0) {
        findings.push({ code: 'selectorNonLeaf', severity: 'error', groupId: node.group.id, selectorId: selector.id, field: null, params: { position, group: node.path } })
      }
    }
    for (const field of SELECTOR_REGEX_FIELDS) {
      if (selector[field] === '') continue
      const compiled = compileJavaRegex(selector[field])
      if (!compiled.ok) {
        onSelector(compiled.reason === 'invalid' ? 'selectorRegexInvalid' : 'selectorRegexUnsupported', compiled.reason === 'invalid' ? 'error' : 'warning', selector.id, position, { field, pattern: selector[field] })
      }
    }
    const queryType = selector.queryType.trim()
    if (queryType !== '' && !(QUERY_TYPES as readonly string[]).includes(queryType.toUpperCase())) {
      onSelector('selectorQueryType', 'error', selector.id, position, { value: queryType })
    }
    if (catchAllAt !== null) onSelector('selectorUnreachable', 'warning', selector.id, position, { catchAll: catchAllAt })
    else if (isCatchAll(selector)) catchAllAt = position
    if (config.mode === 'db') {
      const priority = selector.priority.trim()
      if (priority === '') onSelector('selectorPriorityMissing', 'warning', selector.id, position)
      else if (!/^-?\d+$/.test(priority)) onSelector('selectorPriorityInvalid', 'error', selector.id, position, { value: priority })
      else {
        priorities.set(priority, (priorities.get(priority) ?? 0) + 1)
        if (priorities.get(priority) === 2) onSelector('selectorPriorityTie', 'warning', selector.id, position, { priority })
      }
    }
  })
  if (config.selectors.length === 0) {
    if (nodes.length > 0) onGroup('noSelectors', 'warning', null, null)
  } else {
    if (catchAllAt === null) onGroup('noCatchAll', 'warning', null, null)
    for (const node of nodes) {
      if (node.children.length === 0 && !targeted.has(node.group.id)) onGroup('leafWithoutSelector', 'info', node, null)
    }
  }

  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity] || a.index - b.index)
    .map((entry) => entry.finding)
}

/** One card of the Checks tab: the findings of one group and one severity, or one finding on its own. */
export interface FindingCard {
  severity: Severity
  findings: Finding[]
}

/**
 * Groups findings into cards. Findings that concern a group itself (a group and no selector) share a
 * card per group and severity, so a group is named once for each kind of finding. Findings about a
 * selector, or about no group, keep a card each. Cards follow the order of the first finding they
 * hold, so the order given by `runChecks` (severity, then position) is preserved. An error and a
 * note on one group stay in two cards, because their severity differs.
 */
export function groupFindings(findings: Finding[]): FindingCard[] {
  const cards: FindingCard[] = []
  const byGroup = new Map<string, FindingCard>()
  for (const finding of findings) {
    if (finding.groupId === null || finding.selectorId !== null) {
      cards.push({ severity: finding.severity, findings: [finding] })
      continue
    }
    const key = `${finding.severity}\u0000${finding.groupId}`
    const existing = byGroup.get(key)
    if (existing) {
      existing.findings.push(finding)
      continue
    }
    const card: FindingCard = { severity: finding.severity, findings: [finding] }
    byGroup.set(key, card)
    cards.push(card)
  }
  return cards
}

/** Placeholders of a check message that always hold a name or a keyword taken from the configuration. */
const NAME_KEYS: readonly string[] = ['group', 'name', 'target', 'pattern', 'environments', 'field', 'policy']
/** Codes whose `parent` placeholder holds a group path, not a number or a limit value. */
const PARENT_NAME_CODES: ReadonlySet<CheckCode> = new Set<CheckCode>(['orphan', 'weightMissing', 'weightIgnored', 'queryPriorityChildren'])

/** The placeholders of a check message to show as inline code: names and keywords, never numbers or limit values. */
export function messageCodeKeys(code: CheckCode): readonly string[] {
  return PARENT_NAME_CODES.has(code) ? [...NAME_KEYS, 'parent'] : NAME_KEYS
}

/** The number of cards of one severity, which is what every severity count of the interface shows. */
export function countCards(cards: readonly FindingCard[], severity: Severity): number {
  return cards.filter((card) => card.severity === severity).length
}
