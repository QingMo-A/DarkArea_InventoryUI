Original prompt: 看看这个项目都写了什么

- 2026-03-28: User asked to split the single-file inventory UI and organize the structure.
- Created a static app structure with src/styles/main.css, src/js/demoData.js, src/js/gridUtils.js, and src/js/app.js.
- Kept assets in the workspace root for now and updated JS to resolve them via module-relative URLs.
- Next: run syntax checks and a quick browser-level validation to confirm the refactor preserved behavior.
- Validation: node --check passed for src/js/app.js, src/js/demoData.js, and src/js/gridUtils.js.
- Validation gap: Playwright browser check could not run because the local environment is missing the playwright package required by the provided skill client.
- 2026-03-28 follow-up: fixed a regression where grids/items disappeared when opening index.html directly from disk. Cause was ES module loading; switched back to plain deferred scripts with window-scoped shared modules.
- 2026-03-28 follow-up 2: simplified runtime to a single deferred app.js and added a window error handler in index.html to surface browser-side script failures in the UI.
- 2026-03-28 drag refactor: start drag only after movement threshold, pick target container by pointer position, derive slot from grab-cell offset, recompute target on mouseup, and suppress click after real drags.
- 2026-03-28 pockets layout: styled pocketsGrid as four visually independent slots with a dedicated pockets-grid class and slot gap.
- 2026-03-28 pockets layout: styled pocketsGrid as four visually independent slots with a dedicated pockets-grid class and slot gap.
- 2026-03-28 slot constraints: pockets now only accept 1x1 items via supportsItemInGrid() inside drop targeting.
- 2026-03-28 item externalization: moved item icons to src/items/item_icons, created src/items/item_info/*.ii plus index.json manifest, and refactored app.js to fetch and register all item definitions at startup.
- Runtime note: external item loading now requires serving the project over HTTP. Added scripts/serve.ps1 to start a local static server with Python.
- 2026-03-28 slot border tweak: increased empty slot borders to 2px for both regular grid cells and pockets slots.
- 2026-03-28 repo init: renamed default branch to main and prepared initial backup commit with a minimal .gitignore for temporary local artifacts.
