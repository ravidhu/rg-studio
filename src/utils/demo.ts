import type { RgConfig } from '@/types/model'
import { parseResourceGroupsJson } from '@/utils/parseJson'
import { prioritiesFromOrder } from '@/utils/configReducer'
import { emptyConfig } from '@/utils/tree'

/** Neutral sample shown before any import. All names and values are invented. */
export const DEMO_JSON = `{
  "rootGroups": [
    {
      "name": "global",
      "softMemoryLimit": "90%",
      "hardConcurrencyLimit": 100,
      "maxQueued": 500,
      "schedulingPolicy": "weighted_fair",
      "subGroups": [
        {
          "name": "etl",
          "softMemoryLimit": "60%",
          "hardConcurrencyLimit": 40,
          "maxQueued": 200,
          "softCpuLimit": "24h",
          "hardCpuLimit": "36h",
          "schedulingWeight": 50
        },
        {
          "name": "bi",
          "softMemoryLimit": "50%",
          "hardConcurrencyLimit": 60,
          "maxQueued": 200,
          "schedulingPolicy": "weighted_fair",
          "schedulingWeight": 30,
          "subGroups": [
            {
              "name": "dashboards",
              "softMemoryLimit": "40%",
              "hardConcurrencyLimit": 50,
              "maxQueued": 100,
              "schedulingWeight": 2
            },
            {
              "name": "reports",
              "softMemoryLimit": "20GB",
              "hardConcurrencyLimit": 20,
              "maxQueued": 100,
              "schedulingWeight": 1
            }
          ]
        },
        {
          "name": "adhoc",
          "softMemoryLimit": "30%",
          "softConcurrencyLimit": 20,
          "hardConcurrencyLimit": 30,
          "maxQueued": 100,
          "softCpuLimit": "6h",
          "hardCpuLimit": "12h",
          "schedulingWeight": 20
        }
      ]
    },
    {
      "name": "admin",
      "softMemoryLimit": "100%",
      "hardConcurrencyLimit": 10,
      "maxQueued": 50,
      "schedulingPolicy": "query_priority"
    }
  ],
  "selectors": [
    { "userGroup": "admin", "group": "admin" },
    { "source": ".*etl.*", "group": "global.etl" },
    { "source": "(?i)dashboard-.*", "group": "global.bi.dashboards" },
    { "clientTags": ["report"], "group": "global.bi.reports" },
    { "group": "global.adhoc" }
  ],
  "cpuQuotaPeriod": "1h"
}
`

export function demoConfig(): RgConfig {
  const result = parseResourceGroupsJson(DEMO_JSON)
  if (!result.ok) return emptyConfig()
  // The file has no priorities. The example gets those of its list order, so that it is
  // coherent under either manager from the start.
  return { ...result.config, selectors: prioritiesFromOrder(result.config.selectors) }
}
