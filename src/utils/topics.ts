import type { TopicKey } from '@/i18n/en'

export type TopicSection = 'concept' | 'group' | 'global' | 'selector'
export type SourceKey = 'groups' | 'memory' | 'deploy'

/** Public documentation pages the explanations were checked against. */
export const SOURCE_URLS: Record<SourceKey, string> = {
  groups: 'https://docs.starburst.io/latest/admin/resource-groups.html',
  memory: 'https://docs.starburst.io/latest/admin/properties-resource-management.html',
  deploy: 'https://docs.starburst.io/latest/installation/deployment.html',
}

/** Categories of the concept cards, in reading order. */
export const CONCEPT_CATEGORIES = ['structure', 'limits', 'sharing', 'routing', 'configuration'] as const
/** Categories of the properties, in reading order. */
export const PROPERTY_CATEGORIES = ['groups', 'selectors', 'global'] as const

export type ConceptCategory = (typeof CONCEPT_CATEGORIES)[number]
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number]
export type TopicCategory = ConceptCategory | PropertyCategory

export interface TopicMeta {
  key: TopicKey
  section: TopicSection
  /** What the entry is about, shown as a tag on its card and used by the filter chips. */
  category: TopicCategory
  /** Key in resource-groups.json, `null` when the setting is database only. */
  jsonKey: string | null
  /** Column of the database table, `null` when the setting is file only. */
  dbColumn: string | null
  /** Documentation page to link from the explanation. */
  source?: SourceKey
}

/** Display order of the glossary, with the two names of each setting. */
export const TOPICS: readonly TopicMeta[] = [
  { key: 'conceptAncestors', section: 'concept', category: 'structure', jsonKey: null, dbColumn: null },
  { key: 'conceptSoftHard', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'conceptLeaf', section: 'concept', category: 'structure', jsonKey: null, dbColumn: null },
  { key: 'conceptRoots', section: 'concept', category: 'structure', jsonKey: null, dbColumn: null },
  { key: 'conceptClusterMemory', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'conceptSizing', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'conceptCpu', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'conceptPolicies', section: 'concept', category: 'sharing', jsonKey: null, dbColumn: null },
  { key: 'conceptSelectorOrder', section: 'concept', category: 'routing', jsonKey: null, dbColumn: null },
  { key: 'conceptRegex', section: 'concept', category: 'routing', jsonKey: null, dbColumn: null },
  { key: 'conceptTemplates', section: 'concept', category: 'structure', jsonKey: null, dbColumn: null },
  { key: 'conceptManager', section: 'concept', category: 'configuration', jsonKey: null, dbColumn: null },
  { key: 'conceptYaml', section: 'concept', category: 'configuration', jsonKey: null, dbColumn: null },
  { key: 'conceptModel', section: 'concept', category: 'sharing', jsonKey: null, dbColumn: null },
  { key: 'conceptSunburst', section: 'concept', category: 'sharing', jsonKey: null, dbColumn: null },
  { key: 'conceptCeilings', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'conceptMemoryOver', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'conceptCpuOver', section: 'concept', category: 'limits', jsonKey: null, dbColumn: null },
  { key: 'name', section: 'group', category: 'groups', jsonKey: 'name', dbColumn: 'name' },
  { key: 'hardConcurrencyLimit', section: 'group', category: 'groups', jsonKey: 'hardConcurrencyLimit', dbColumn: 'hard_concurrency_limit' },
  { key: 'softConcurrencyLimit', section: 'group', category: 'groups', jsonKey: 'softConcurrencyLimit', dbColumn: 'soft_concurrency_limit' },
  { key: 'maxQueued', section: 'group', category: 'groups', jsonKey: 'maxQueued', dbColumn: 'max_queued' },
  { key: 'softMemoryLimit', section: 'group', category: 'groups', jsonKey: 'softMemoryLimit', dbColumn: 'soft_memory_limit' },
  { key: 'softCpuLimit', section: 'group', category: 'groups', jsonKey: 'softCpuLimit', dbColumn: 'soft_cpu_limit' },
  { key: 'hardCpuLimit', section: 'group', category: 'groups', jsonKey: 'hardCpuLimit', dbColumn: 'hard_cpu_limit' },
  { key: 'hardPhysicalDataScanLimit', section: 'group', category: 'groups', jsonKey: 'hardPhysicalDataScanLimit', dbColumn: 'hard_physical_data_scan_limit' },
  { key: 'schedulingPolicy', section: 'group', category: 'groups', jsonKey: 'schedulingPolicy', dbColumn: 'scheduling_policy' },
  { key: 'schedulingWeight', section: 'group', category: 'groups', jsonKey: 'schedulingWeight', dbColumn: 'scheduling_weight' },
  { key: 'jmxExport', section: 'group', category: 'groups', jsonKey: 'jmxExport', dbColumn: 'jmx_export' },
  { key: 'subGroups', section: 'group', category: 'groups', jsonKey: 'subGroups', dbColumn: 'parent' },
  { key: 'environment', section: 'group', category: 'groups', jsonKey: null, dbColumn: 'environment' },
  { key: 'cpuQuotaPeriod', section: 'global', category: 'global', jsonKey: 'cpuQuotaPeriod', dbColumn: 'cpu_quota_period', source: 'groups' },
  { key: 'physicalDataScanQuotaPeriod', section: 'global', category: 'global', jsonKey: 'physicalDataScanQuotaPeriod', dbColumn: 'physical_data_scan_quota_period', source: 'groups' },
  { key: 'selGroup', section: 'selector', category: 'selectors', jsonKey: 'group', dbColumn: 'resource_group_id' },
  { key: 'selPriority', section: 'selector', category: 'selectors', jsonKey: null, dbColumn: 'priority' },
  { key: 'selUser', section: 'selector', category: 'selectors', jsonKey: 'user', dbColumn: 'user_regex' },
  { key: 'selOriginalUser', section: 'selector', category: 'selectors', jsonKey: 'originalUser', dbColumn: 'original_user_regex' },
  { key: 'selAuthenticatedUser', section: 'selector', category: 'selectors', jsonKey: 'authenticatedUser', dbColumn: 'authenticated_user_regex' },
  { key: 'selUserGroup', section: 'selector', category: 'selectors', jsonKey: 'userGroup', dbColumn: 'user_group_regex' },
  { key: 'selSource', section: 'selector', category: 'selectors', jsonKey: 'source', dbColumn: 'source_regex' },
  { key: 'selQueryText', section: 'selector', category: 'selectors', jsonKey: 'queryText', dbColumn: 'query_text_regex' },
  { key: 'selQueryType', section: 'selector', category: 'selectors', jsonKey: 'queryType', dbColumn: 'query_type' },
  { key: 'selClientTags', section: 'selector', category: 'selectors', jsonKey: 'clientTags', dbColumn: 'client_tags' },
]

export function topicMeta(key: TopicKey): TopicMeta | undefined {
  return TOPICS.find((topic) => topic.key === key)
}
