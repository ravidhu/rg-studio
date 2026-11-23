/** Shared test fixture: a three-level tree with weights and hard limits. */
export const WEIGHTED_TREE_JSON = JSON.stringify({
  rootGroups: [
    {
      name: 'R',
      hardConcurrencyLimit: 200,
      maxQueued: 400,
      schedulingPolicy: 'weighted_fair',
      subGroups: [
        {
          name: 'A',
          hardConcurrencyLimit: 150,
          maxQueued: 300,
          schedulingPolicy: 'weighted_fair',
          schedulingWeight: 60,
          subGroups: [
            { name: 'A1', hardConcurrencyLimit: 80, maxQueued: 120, schedulingWeight: 3 },
            { name: 'A2', hardConcurrencyLimit: 100, maxQueued: 80, schedulingWeight: 1 },
          ],
        },
        {
          name: 'U',
          hardConcurrencyLimit: 80,
          maxQueued: 150,
          schedulingPolicy: 'weighted_fair',
          schedulingWeight: 30,
          subGroups: [
            { name: 'U1', hardConcurrencyLimit: 60, maxQueued: 50, schedulingWeight: 1 },
            { name: 'U2', hardConcurrencyLimit: 40, maxQueued: 40, schedulingWeight: 1 },
            { name: 'U3', hardConcurrencyLimit: 60, maxQueued: 60, schedulingWeight: 1 },
          ],
        },
        { name: 'D', hardConcurrencyLimit: 20, maxQueued: 30, schedulingWeight: 10 },
      ],
    },
  ],
  selectors: [{ group: 'R.D' }],
})
