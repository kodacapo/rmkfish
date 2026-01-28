# Executed: Replace Single Profit Toggle with Three Independent Toggles

## Original Plan

Replace the single `profitDisplayDisabled` checkbox with three separate toggles:
- **Disable season profit column** (`profitSeasonDisabled`)
- **Disable overall profit column** (`profitTotalDisabled`)
- **Disable profit diff column** (`profitGapDisabled`)

**Defaults for new microworlds:**
- `profitSeasonDisabled`: **false** (season profit shown)
- `profitTotalDisabled`: **false** (overall profit shown)
- `profitGapDisabled`: **true** (profit diff hidden by default)

Old microworlds with `profitDisplayDisabled: true` continue to work (all three columns hidden).

## Execution Summary

### Step 1: Updated Mongoose Schema
**File:** `src/models/microworld-model.js` (line 43)

Added three new Boolean fields after `profitDisplayDisabled`:
```js
profitSeasonDisabled: Boolean,
profitTotalDisabled: Boolean,
profitGapDisabled: { type: Boolean, default: true },
```
Kept `profitDisplayDisabled` for backward compatibility.

### Step 2: Updated Ocean Accessors
**File:** `src/engine/ocean.js` (lines 171-173)

Replaced single `profitDisplayIsDisabled()` with:
- `profitSeasonIsDisabled()` — returns `profitSeasonDisabled || profitDisplayDisabled`
- `profitTotalIsDisabled()` — returns `profitTotalDisabled || profitDisplayDisabled`
- `profitGapIsDisabled()` — returns `profitGapDisabled || profitDisplayDisabled`
- `profitDisplayIsDisabled()` — **kept**, now returns true only when all three are disabled

### Step 3: Updated Microworld Admin Template
**File:** `views/microworld.pug` (lines 283-289)

Replaced single "Disable profit columns" checkbox with three:
- `input#disable-profit-season` — "Disable season profit column" (default: unchecked)
- `input#disable-profit-total` — "Disable overall profit column" (default: unchecked)
- `input#disable-profit-gap` — "Disable profit diff column" (default: checked)

Each with its own tooltip.

### Step 4: Updated Microworld Client JS
**File:** `public/js/microworld.js`

- **Line 51**: Replaced `$('#profit-columns-tooltip').tooltip()` with three tooltip inits (`#profit-season-tooltip`, `#profit-total-tooltip`, `#profit-gap-tooltip`)
- **Line 331**: Replaced `mw.profitDisplayDisabled = ...` with three reads: `mw.profitSeasonDisabled`, `mw.profitTotalDisabled`, `mw.profitGapDisabled`
- **Lines 481-482**: Populate three checkboxes with legacy fallback; `maybeDisableProfitControls` only called with "all disabled" boolean
- **Lines 653-657**: Replaced single click handler with `onProfitCheckboxChange()` bound to all three checkboxes

### Step 5: Updated Fish Game Client JS
**File:** `public/js/fish.js`

- **Lines 217-236**: Split `hideProfitColumns()` into:
  - `hideProfitSeasonColumn()` — hides season header, th, and cells
  - `hideProfitTotalColumn()` — hides total header, th, and cells
  - `hideProfitGapColumn()` — hides gap header and cells
  - `hideAllProfitExtras()` — hides costs box (only when all three disabled)
  - `hideProfitColumns()` — kept as wrapper calling all four
- Added helper functions: `isProfitSeasonDisabled()`, `isProfitTotalDisabled()`, `isProfitGapDisabled()`, `areAllProfitColumnsDisabled()` — each checks new field OR legacy `profitDisplayDisabled`
- **Lines 559-561** (`setupOcean`): Now calls individual hide functions per flag
- **Lines 431-437** (own fisher): Each column checked independently
- **Lines 489-502** (other fishers): Each column checked independently, respecting `showFisherBalance` per column

### Step 6: Updated Tests

**`src/engine/ocean.test.js`:**
- Added `profitSeasonDisabled`, `profitTotalDisabled`, `profitGapDisabled` to mock microworld params
- Replaced single `profitDisplayIsDisabled()` test with 9 tests covering each accessor, defaults, backward compatibility, and combined behavior

**`public/js/fish.test.js`:**
- Added `profit-gap-header`, `f0-profit-gap`, `f1-profit-gap` to DOM element setup
- Added display style reset in `beforeEach` to prevent test state leakage
- Added new fields to `window.ocean` mock objects
- Added test suites for `hideProfitSeasonColumn()`, `hideProfitTotalColumn()`, `hideProfitGapColumn()`
- Updated `setupOcean()` tests: legacy backward compat, per-column disabling, costs box only hidden when all three disabled

**`src/engine/ocean-manager.test.js`:**
- Added three new fields to all 5 mock microworld params blocks

**`src/engine/engine-leak.test.js`:**
- Added three new fields to mock microworld params

## Verification Results

- **`npm run build`**: All 48 files compiled successfully (33 server + 15 client)
- **`npm test`**: **316 tests passing**, 0 failures (11s)
- Coverage: fish.js at 77% statements, ocean.js at 56%

## Backward Compatibility

No data migration needed. The `||` fallback in each accessor ensures:

| Scenario | `profitDisplayDisabled` | Three new fields | Behavior |
|---|---|---|---|
| Old microworld (all hidden) | `true` | `undefined` | All three columns hidden |
| Old microworld (all shown) | `false` | `undefined` | All three columns shown |
| New microworld (mixed) | absent | e.g., `false, false, true` | Season shown, Total shown, Gap hidden |
| New microworld (all hidden) | absent | `true, true, true` | All hidden, costs box hidden, show-fisher-balance disabled |

## Issues Encountered During Execution

1. **`mongosh` ICU library mismatch**: `mongosh` was linked against `libicui18n.73.dylib` but Homebrew had upgraded to `icu4c@76`. Fixed with `brew update && brew reinstall mongosh`.
2. **MongoDB not running**: `devreset` failed with `MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017`. Fixed with `brew services start mongodb-community`.
3. **Accidental DB wipe**: `npm run devreset` wiped the database. Restored from macOS backup by restoring `/usr/local/var/mongodb`.
4. **Port conflict during tests**: Dev server on port 8080 caused test suite to fail with `EADDRINUSE`. Stopped dev server before running tests.
5. **Test state leakage**: DOM elements retained `display: none` styles between tests, causing 4 false failures. Fixed by adding display style resets in `beforeEach` blocks.
