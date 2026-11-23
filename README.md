# RG Studio

A single-page tool that shows what a Starburst Enterprise resource
group configuration gives each group: simultaneous queries, memory in GB, CPU in
vCPUs and queue places. It also checks the configuration for incoherences,
tests selectors and explains every setting. The interface is available in
English and in French.

The Configuration page opens first: import, edit, check and export a
configuration there. The Group allocation page then shows, for the case where every leaf group has queries
waiting, who gets the simultaneous queries (a sunburst with drill-down), the memory and CPU
ceilings of each group, the concurrency and queue limits, and a table. The
other pages are the Selector tester and the Glossary. The cluster size is entered in the side menu.

Everything runs in the browser. An imported file is parsed in memory and is never
sent anywhere: the built page makes no network request and carries a content
security policy that forbids them. The configuration is saved in this
browser only, on this computer, so that a reload keeps it. It is never sent
anywhere, and it can be deleted at any time from the side menu.

## Use

The tool is one HTML file, `dist/index.html`. Open the hosted page, or download the file and open it from disk: it works offline. It starts on a built-in example with invented groups. Choose "Import my configuration" in the welcome dialog, or the Configuration page, to load your own files, then open the Group allocation page.

## Compatibility

Works with Starburst Enterprise 479 and later (checked on 482).

## Accepted inputs

- The `resource-groups.json` file of the file-based manager (`rootGroups`,
  `subGroups`, `selectors`, `cpuQuotaPeriod`), chosen from disk or dropped on the page.
- YAML, in two shapes recognised by their top keys: the content of
  `resource-groups.json` written in YAML, and a database loader format
  (`environment`, `ownership`, `groups` nested under `subgroups` with explicit
  ids, `selectors` by group path and priority). Only the core YAML schema is
  read: tags are refused, aliases are limited, templating is not evaluated.
- CSV exports of the tables of the database manager, with the column names on
  the first line: `resource_groups` (required), `selectors` and
  `resource_groups_global_properties` (both optional). Quoted fields, any
  column order, comma, semicolon or tab separators and Windows line ends are
  accepted. Optional columns may be missing.
- A configuration built or edited by hand on the Configuration page.

Each input is limited to 2 MB and 5000 rows or groups. An input with a
structural or type error is rejected as a whole, with the file, line and
column of each problem. Values that are well formed but questionable are
imported and listed in the Checks tab of the Configuration page.

The configuration can be exported as `resource-groups.json`, as YAML in the
shape that matches the manager, or as SQL `INSERT` statements for the database
tables.

## Build

Node.js 20 or later is required.

```sh
npm install
npm run build
```

The result is one self-contained file, `dist/index.html`, with all scripts and
styles inlined. It can be opened from disk or served by any static host.

Other commands:

```sh
npm run dev    # development server
npm test       # unit tests
npm run lint   # ESLint
npx tsc -b     # type check
```

## Host on GitHub Pages

The page is a single static file, and `dist/index.html` is committed, so the host builds nothing.

1. Run `npm run build` and commit `dist/index.html`.
2. Push to `main`. The workflow in `.github/workflows/pages.yml` publishes the `dist` folder to GitHub Pages.
3. The first time, in the repository settings under Pages, set the source to GitHub Actions.

## Limits of the model

The simultaneous queries chart estimates the steady state when every leaf group is saturated. It ignores soft concurrency limits, memory and CPU limits, query
priorities, arrival order and query duration. Selector patterns are Java
regular expressions: the tester evaluates them with the JavaScript engine and
reports Java-only syntax instead of guessing.
