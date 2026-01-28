# Plan: Replace Single Profit Toggle with Three Independent Toggles

## Summary

Replace the single `profitDisplayDisabled` checkbox with three separate toggles:
- **Disable season profit column** (`profitSeasonDisabled`)
- **Disable overall profit column** (`profitTotalDisabled`)
- **Disable profit diff column** (`profitGapDisabled`)

Old microworlds with `profitDisplayDisabled: true` will continue to work (all three columns hidden).

## Files to Modify

### 1. `src/models/microworld-model.js` (line 43)
Add three new Boolean fields after the existing `profitDisplayDisabled`:
```
profitSeasonDisabled: Boolean,
profitTotalDisabled: Boolean,
profitGapDisabled: Boolean,
```
Keep `profitDisplayDisabled` for backward compatibility with existing data.

### 2. `src/engine/ocean.js` (lines 171-173)
Replace `profitDisplayIsDisabled()` with individual accessors that fall back to the legacy field:
```js
profitSeasonIsDisabled()  // returns profitSeasonDisabled || profitDisplayDisabled
profitTotalIsDisabled()   // returns profitTotalDisabled || profitDisplayDisabled
profitGapIsDisabled()     // returns profitGapDisabled || profitDisplayDisabled
allProfitColumnsDisabled() // returns all three disabled
```

### 3. `views/microworld.pug` (lines 283-289)
Replace single checkbox with three:
- `input#disable-profit-season` — "Disable season profit column"
- `input#disable-profit-total` — "Disable overall profit column"
- `input#disable-profit-gap` — "Disable profit diff column"

Each with its own tooltip.

### 4. `public/js/microworld.js`
- **Line 51**: Replace `$('#profit-columns-tooltip').tooltip()` with three tooltip inits
- **Line 331**: Replace `mw.profitDisplayDisabled = ...` with three separate reads from the new checkboxes
- **Lines 481-482**: Populate three checkboxes (with legacy fallback); call `maybeDisableProfitControls` only when all three are checked
- **Lines 533-535**: `maybeDisableProfitControls` — no signature change, caller passes computed "all disabled" boolean
- **Lines 653-657**: Replace single click handler with handler on all three checkboxes that computes "all disabled" state

### 5. `public/js/fish.js`
- **Lines 217-236**: Split `hideProfitColumns()` into `hideProfitSeasonColumn()`, `hideProfitTotalColumn()`, `hideProfitGapColumn()`. Keep `hideProfitColumns()` as a wrapper that calls all three + hides costs box. Only hide costs box when all three are disabled.
- Add helper functions: `isProfitSeasonDisabled()`, `isProfitTotalDisabled()`, `isProfitGapDisabled()`, `areAllProfitColumnsDisabled()` — each checks its new field OR the legacy `profitDisplayDisabled`
- **Lines 559-561** (`setupOcean`): Call individual hide functions based on each flag
- **Lines 431-437** (own fisher profit update): Check each column independently
- **Lines 489-502** (other fishers profit update): Check each column independently, respecting `showFisherBalance` per column

### 6. Tests
- **`src/engine/ocean.test.js`**: Replace `profitDisplayIsDisabled()` test with tests for each new accessor + backward compat test
- **`public/js/fish.test.js`**: Add tests for individual hide functions; update `setupOcean()` tests for per-column disabling

## Backward Compatibility

No data migration needed. The `||` fallback in each accessor ensures:
| Old data (`profitDisplayDisabled: true`) | Three new fields: `undefined` | Result: all columns hidden |
| New data (mixed toggles) | `profitDisplayDisabled` absent | Result: per-column control |

## Verification

1. `npm run build` — confirm transpilation succeeds
2. `npm test` — all existing + new tests pass
3. Manual: create microworld with mixed toggles (e.g., season hidden, total shown, gap hidden) and verify correct columns appear during gameplay
4. Manual: load an old microworld with `profitDisplayDisabled: true` and verify all three columns remain hidden
