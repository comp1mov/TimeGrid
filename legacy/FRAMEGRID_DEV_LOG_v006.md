# FRAMEGRID Development Log v0.06
## Session: January 21, 2025

---

## 🎯 Target Features for v0.06

### Completed ✅
1. **Info Card Auto-scale** - Uses container queries for responsive text
2. **JPEG Export → 4K max** - Changed from 8K to 4K limit
3. **Reactive Auto-fit** - Responds to window resize with debounce
4. **Canvas Aspect Ratio** - Constrains grid to specific aspect ratios
5. **New Export Filename Format** - `fg_NAME_199f_e3s_c21_012125_1430.jpg`
6. **About Section Collapsible** - Hidden by default, click to expand
7. **Version in App Title** - Shows `FRAMEGRID v0.06` in metadata bar

### Problematic 🔴
8. **Export Timecode Size** - Text still too small in exports

---

## 🐛 Known Issues & Attempted Solutions

### Issue #1: Export Timecode Too Small
**Status:** UNRESOLVED after multiple attempts

#### Problem Description:
- Timecode text in exported images (PNG/JPEG) appears much smaller than in the app UI
- User reports text is unreadable at export resolutions
- Current font size calculation not scaling properly with frame dimensions

#### Attempts Made:

**Attempt 1:**
```javascript
const exportFontSize = Math.max(frameWidth * 0.025, 10);
const plateHeight = exportFontSize * 2.5;
```
- **Result:** Syntax error - variable declared twice
- **Issue:** Code was inserted in two places

**Attempt 2:**
```javascript
const exportFontSize = Math.max(frameWidth * 0.025, 10); // Declared once
const plateHeight = exportFontSize * 2.5;
ctx.font = `${exportFontSize}px monospace`;
```
- **Result:** Still syntax error
- **Issue:** Variable name conflict or caching issue

**Attempt 3:**
```javascript
const tcFontSize = Math.max(Math.floor(frameWidth * 0.025), 10);
const plateHeight = tcFontSize * 2.5;
ctx.font = `${tcFontSize}px monospace`;
```
- **Result:** No syntax error, but text still reported as too small
- **Issue:** 2.5% of frame width may be insufficient

#### Root Cause Analysis:
1. **Scaling Factor Too Low** - `frameWidth * 0.025` (2.5%) produces small text
2. **Minimum Size Too Low** - 10px minimum is too small for high-res exports
3. **App UI vs Export Disconnect** - UI font size (state.fontSize) is 10px default but looks fine in browser due to zoom/scaling
4. **Export Resolution Variation** - Same multiplier doesn't work across 1080p to 4K range

#### Proposed Solutions to Try:

**Option A: Increase Scaling Factor**
```javascript
// Try 4-5% instead of 2.5%
const tcFontSize = Math.max(Math.floor(frameWidth * 0.045), 14);
const plateHeight = tcFontSize * 2.5;
```

**Option B: Resolution-Based Tiers**
```javascript
// Different sizes based on export resolution
let tcFontSize;
if (frameWidth < 300) {
  tcFontSize = 12;
} else if (frameWidth < 600) {
  tcFontSize = 18;
} else if (frameWidth < 1200) {
  tcFontSize = 24;
} else {
  tcFontSize = 32;
}
const plateHeight = tcFontSize * 2.8;
```

**Option C: Match UI Proportions**
```javascript
// Calculate based on frame proportion relative to UI
const uiFrameWidth = framesGrid.querySelector('.frame-image-wrap')?.offsetWidth || 200;
const scaleFactor = frameWidth / uiFrameWidth;
const tcFontSize = Math.max(Math.floor(state.fontSize * scaleFactor), 12);
const plateHeight = tcFontSize * 2.8;
```

**Option D: DPI-Aware Scaling**
```javascript
// Account for typical DPI at different resolutions
const dpi = frameWidth > 800 ? 2 : 1; // 2x for retina/high-res
const tcFontSize = Math.max(Math.floor(state.fontSize * dpi * 1.5), 14);
const plateHeight = tcFontSize * 3;
```

#### Testing Checklist:
- [ ] Export at 1080p (JPEG) - text readable?
- [ ] Export at 2K - text readable?
- [ ] Export at 4K (JPEG) - text readable?
- [ ] Export at 8K (PNG) - text readable?
- [ ] Compare with UI appearance - proportions match?
- [ ] Test with different Grid Columns (2, 6, 12, 20) - scales appropriately?

---

### Issue #2: About Section Not Collapsing
**Status:** RESOLVED ✅

#### Problem:
- About section CSS was correct but HTML structure was incomplete
- Missing wrapper div for collapsible content

#### Solution:
```html
<div class="about-section collapsed">
  <div class="about-header">
    <!-- Clickable header -->
  </div>
  <div class="about-content">
    <!-- Collapsible content -->
  </div>
</div>
```

#### CSS:
```css
.about-content {
  max-height: 1000px;
  transition: max-height 0.3s ease, opacity 0.3s ease;
}

.about-section.collapsed .about-content {
  max-height: 0;
  opacity: 0;
}
```

---

### Issue #3: Repeating Same Fixes
**Status:** PROCESS ISSUE 🔄

#### Problem:
- Making the same changes multiple times
- Not verifying changes are actually applied
- File version confusion (v006_fix, v006_fix2, v006_fix3)

#### Solutions:
1. **Always check file after changes:**
   ```bash
   grep -n "tcFontSize" framegrid_vXXX.html
   ```

2. **Use single source of truth:**
   - Keep one "final" version
   - Test before declaring complete

3. **Verify in browser:**
   - Open file in browser
   - Check console for errors
   - Test actual export

---

## 📋 Next Steps for v0.07

### Planned Features:
1. **GIF Export** - Export frames as animated GIF
   - FPS selector (1-30 fps)
   - Quality settings
   - Max resolution (1080p for GIF)

2. **Play Animation** - Cycle through frames in UI
   - Play button
   - Loop animation
   - FPS control
   - Play in individual frame or whole grid

3. **Timeline Scrubbing** - Hover to scrub through video
   - Thin timeline bar on hover
   - Load ±2-3 seconds around frame
   - Left-right drag to scrub

### Technical Considerations:
- **GIF Library:** Use `gif.js` or similar
- **Animation Loop:** `requestAnimationFrame` for smooth playback
- **Video Segment Loading:** Load video segments on-demand for scrubbing
- **Performance:** Throttle/debounce hover events

---

## 🎨 Design Decisions Log

### Canvas Aspect Ratio Implementation
**Decision:** Aspect ratio constrains the canvas, not forces grid aspect
**Rationale:** More intuitive - you're setting the "frame" size, and auto-fit fills it
**Implementation:** Constrain `availableWidth/Height` before calculating columns

### Export Filename Format
**Format:** `fg_NAME_199f_e3s_c21_012125_1430.jpg`
**Rationale:** 
- Includes all relevant metadata
- Sortable by date
- Clear mode indicator (e3s = every 3 seconds)
- Column count for reference

### Info Card Auto-scale
**Method:** CSS Container Queries with `cqw` units
**Rationale:** Modern, responsive, no JavaScript needed
**Trade-off:** Requires modern browser support

---

## 🔧 Technical Debt

### Current Issues:
1. Export timecode size calculation needs review
2. File versioning getting messy (too many _fix variants)
3. No automated testing for export functionality

### Future Improvements:
1. Add export preview before download
2. Test suite for different resolutions
3. Better error handling for file operations
4. Consolidate CSS variables for theming

---

## 💡 Ideas for Future Versions

### v0.08+
- **Hover Preview:** Show ±2 sec video segment on hover
- **Frame Sorting:** By brightness, contrast, hue
- **Montage Mode:** Select/reorder frames for export
- **Palette Extraction:** Show dominant colors per frame
- **Scene Detection:** Auto-detect scene changes
- **Multi-video Comparison:** Side-by-side grids

### Nice to Have:
- Keyboard shortcuts for everything
- Drag to reorder frames
- Export to XML/EDL for editing software
- Cloud save/load configurations
- Batch processing multiple videos

---

## 📝 Notes for Next Session

### Before starting v0.07:
1. ✅ Fix export timecode size issue (try Option B or C)
2. ✅ Verify About section actually collapses in browser
3. ✅ Clean up file versions - keep only _final
4. ✅ Test all export sizes with actual video
5. Document working timecode calculation for reference

### Questions to Answer:
- [ ] Should GIF animation play automatically or require click?
- [ ] How to handle memory with many frames + video segments?
- [ ] UI for timeline scrubbing - overlay on frame or separate control?
- [ ] Should Play button be global or per-frame?

---

## 🎯 Success Criteria for v0.06

### Must Have: ✅
- [✅] Canvas Aspect constrains grid properly
- [✅] About section collapsible by default
- [✅] New filename format working
- [🔴] Export timecode readable at all resolutions

### Nice to Have: ✅
- [✅] Reactive auto-fit on window resize
- [✅] Version shown in app title
- [✅] Info card scales with container

### Next Version: ⏭️
- [⏭️] GIF export
- [⏭️] Play animation
- [⏭️] Timeline scrubbing

---

_Last Updated: 2025-01-21 by Claude & Grisha_
