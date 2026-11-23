import type { Dictionary } from '@/i18n/en'
import type { GroupField, ResourceGroup } from '@/types/model'
import { parseDataSize, parseDuration, parseMemoryLimit, parseNonNegativeInteger } from '@/utils/units'

export type FieldErrorKey = keyof Dictionary['editor']['errors']

/** Inline validation of one property of a group, as the user types. */
export function validateGroupField(
  field: GroupField | 'name',
  group: ResourceGroup,
  siblings: readonly ResourceGroup[],
): FieldErrorKey | null {
  const value = (field === 'name' ? group.name : group[field]).trim()
  switch (field) {
    case 'name':
      if (value === '') return 'required'
      return siblings.some((sibling) => sibling.id !== group.id && sibling.name === group.name) ? 'duplicate' : null
    case 'maxQueued':
    case 'hardConcurrencyLimit':
      if (value === '') return 'required'
      return parseNonNegativeInteger(value) === null ? 'integer' : null
    case 'softConcurrencyLimit': {
      if (value === '') return null
      const soft = parseNonNegativeInteger(value)
      if (soft === null) return 'integer'
      const hard = parseNonNegativeInteger(group.hardConcurrencyLimit)
      return hard !== null && soft > hard ? 'softAboveHard' : null
    }
    case 'schedulingWeight':
      return value !== '' && parseNonNegativeInteger(value) === null ? 'integer' : null
    case 'softMemoryLimit':
      return value !== '' && parseMemoryLimit(value) === null ? 'memory' : null
    case 'softCpuLimit': {
      if (value === '') return null
      const soft = parseDuration(value)
      if (soft === null) return 'duration'
      const hard = parseDuration(group.hardCpuLimit)
      return hard !== null && soft > hard ? 'softAboveHard' : null
    }
    case 'hardCpuLimit':
      return value !== '' && parseDuration(value) === null ? 'duration' : null
    case 'hardPhysicalDataScanLimit':
      return value !== '' && parseDataSize(value) === null ? 'dataSize' : null
    default:
      return null
  }
}
