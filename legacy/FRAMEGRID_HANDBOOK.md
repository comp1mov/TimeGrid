# FRAMEGRID — Developer Handbook

**Version:** 0.04  
**Author:** Grisha Tsvetkov  
**Website:** [grisha-tsvetkov.com](https://www.grisha-tsvetkov.com)  
**Instagram:** [@grisha.tsvet](https://www.instagram.com/grisha.tsvet)

---

## 📋 Overview

FRAMEGRID is a browser-based video frame extraction tool for creating contact sheets, storyboard analysis, and AI-ready visual summaries. It extracts frames from video files and displays them in a customizable grid layout with metadata.

### Use Cases
- Creating visual summaries of video content for AI analysis
- Storyboard reference sheets
- Animation frame analysis
- Video content review and documentation
- Contact sheet generation for film/video production

---

## 🏗️ Architecture

### Tech Stack
- **Pure HTML/CSS/JavaScript** — Single file, no dependencies
- **Canvas API** — Frame capture and export
- **HTML5 Video API** — Video loading and seeking
- **File API** — Local file handling

### File Structure
```
framegrid_v003.html
├── <style> — All CSS (embedded)
├── <body>
│   ├── .app — Main container
│   │   ├── .metadata-bar — Top info bar
│   │   ├── .canvas-area — Zoomable/pannable viewport
│   │   │   ├── .canvas-inner — Transform container
│   │   │   │   └── .frames-grid — CSS Grid of frames
│   │   │   ├── .drop-zone — File drop UI
│   │   │   └── .mobile-menu-btn
│   │   ├── .side-menu — Settings panel
│   │   ├── .progress-bar
│   │   └── .loading-overlay
│   └── Hidden elements (video, canvas, input)
└── <script> — All JavaScript (IIFE)
```

---

## 📊 State Management

All application state is managed in a single `state` object:

```javascript
const state = {
  // Video data
  videoFile: null,        // File object
  videoUrl: null,         // Blob URL
  videoDuration: 0,       // seconds
  videoWidth: 0,          // pixels
  videoHeight: 0,         // pixels
  videoFps: 30,           // estimated
  videoDate: null,        // Date object (file modification date)
  
  // Frames
  frames: [],             // Array of {time, frameNumber, dataUrl}
  frameCount: 24,         // Fixed count mode
  
  // Grid settings
  gridCols: 6,            // Number of columns
  selectionMode: 'count', // 'count' | 'seconds' | 'frames'
  intervalValue: 1,       // Interval for seconds/frames mode
  quality: 1,             // 1 (full) | 0.5 (half) | 0.25 (quarter)
  
  // Display settings
  showMetadata: true,     // Top bar visibility
  showTimecode: true,     // Frame timecode visibility
  showInfoCard: true,     // Info card as first frame
  autoFit: true,          // Auto-fit grid to screen
  bgColor: '#0a0a0a',     // Background color
  fontSize: 12,           // Timecode font size (8-28)
  spacing: 2,             // Gap between frames (0-20)
  
  // Pan & Zoom
  scale: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startPanX: 0,
  startPanY: 0,
  startMouseX: 0,
  startMouseY: 0,
  
  // UI state
  menuOpen: false
};
```

---

## 🎬 Core Functions

### Video Loading

```javascript
handleFile(file)
```
- Validates file is video type
- Creates blob URL
- Loads into hidden `<video>` element
- Extracts metadata on `loadedmetadata` event

### Frame Extraction

```javascript
async generateFrames()
```
1. Calculates frame times based on selection mode
2. Auto-calculates optimal columns if `autoFit` is enabled
3. Sets capture canvas size based on quality setting
4. Iterates through times, capturing each frame
5. Stores frame data as base64 JPEG
6. Calls `renderGrid()` and `fitToScreen()`

```javascript
calculateFrameTimes() → number[]
```
Returns array of timestamps to capture based on mode:
- **count**: Evenly distributed N frames
- **seconds**: Every N seconds
- **frames**: Every N video frames

```javascript
async captureFrame(time) → string
```
- Seeks video to time
- Draws to canvas
- Returns base64 data URL

### Grid Rendering

```javascript
renderGrid()
```
- Clears grid container
- Sets CSS Grid columns
- Creates info card if enabled
- Creates frame items with images and timecodes
- Applies current font size and spacing

```javascript
fitToScreen()
```
- Calculates available viewport
- Determines optimal frame size
- Centers grid and sets scale to 1
- Updates transform

### Pan & Zoom

```javascript
updateTransform()
```
Applies current `panX`, `panY`, and `scale` to `.canvas-inner` via CSS transform.

**Mouse Events:**
- `mousedown` → Start panning (left button only)
- `mousemove` → Update pan position
- `mouseup` → Stop panning
- `wheel` → Zoom toward cursor position

**Touch Events:**
- Single touch → Pan
- Two-finger pinch → Zoom

### Export

```javascript
exportImage(format, small)
```
- **format**: `'png'` or `'jpeg'`
- **small**: `true` limits max dimension to 2048px

Process:
1. Creates export canvas with calculated dimensions
2. Draws background color
3. Draws metadata header if enabled
4. Draws info card if enabled
5. Draws all frames with timecodes
6. Triggers download

---

## 🎨 CSS Architecture

### CSS Variables

```css
--bg-color: #0a0a0a;        /* Background color */
--video-aspect: 16/9;        /* Video aspect ratio */
--grid-gap: 2px;             /* Frame spacing */
--meta-height: 26px;         /* Timecode bar height */
--meta-font-size: 12px;      /* Timecode font size */
--ui-font-size: 11px;        /* UI font size */
```

### Key Classes

| Class | Purpose |
|-------|---------|
| `.app` | Root container, flex column |
| `.metadata-bar` | Fixed top bar with video info |
| `.canvas-area` | Viewport for pan/zoom |
| `.canvas-inner` | Transform target |
| `.frames-grid` | CSS Grid container |
| `.frame-item` | Individual frame container |
| `.frame-image-wrap` | Image wrapper with aspect-ratio |
| `.frame-meta` | Timecode label |
| `.info-card` | Metadata card (first frame) |
| `.side-menu` | Settings panel |
| `.drop-zone` | File drop target |

### Responsive Breakpoints

- **768px**: Mobile menu button appears, side menu wider
- **480px**: Full-width side menu, hide some metadata items

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `M` | Toggle menu |
| `F` | Fit to screen |
| `Esc` | Close menu |

---

## 📝 Frame Selection Modes

### 1. Fixed Count (`count`)
Extracts exactly N frames evenly distributed across video duration.

```javascript
for (let i = 0; i < count; i++) {
  const time = (duration / (count + 1)) * (i + 1);
  times.push(time);
}
```

### 2. Every N Seconds (`seconds`)
Extracts frames at regular time intervals.

```javascript
let t = 0;
while (t < duration) {
  times.push(t);
  t += intervalValue;
}
```

### 3. Every N Frames (`frames`)
Extracts every Nth video frame (based on estimated FPS).

```javascript
let frame = 0;
while ((frame / fps) < duration) {
  times.push(frame / fps);
  frame += intervalValue;
}
```

---

## 🖼️ Quality Settings

| Setting | Capture Size | Use Case |
|---------|--------------|----------|
| Full | 100% of video | High-quality exports |
| Half | 50% of video | Balanced quality/performance |
| Quarter | 25% of video | Fast preview, large videos |

---

## 📤 Export Formats

### PNG (Full)
- Lossless compression
- Full resolution frames
- Max canvas size: 8192px
- Quality: 95%

### JPEG (Small)
- Lossy compression
- Max dimension: 2048px
- Quality: 85%
- Smaller file size for sharing

---

## 🔧 Configuration Options

### Menu Sections

#### Frame Selection
- **Mode**: count / seconds / frames
- **Frame Count**: 1-200 (count mode)
- **Interval**: 1+ (seconds/frames mode)
- **Quality**: Full / Half / Quarter

#### Grid Layout
- **Columns**: 1-20
- **Auto-fit**: Automatic column calculation
- **Spacing**: 0-20px

#### Display
- **Show Metadata Bar**: Top info bar visibility
- **Show Timecode**: Frame labels visibility
- **Show Info Card**: Metadata card as first frame
- **Font Size**: 8-28px
- **Background**: Color picker

---

## 🚀 Future Features (Planned)

### v0.05
- [ ] Hover preview (±2 sec video playback on frame hover)
- [ ] Click to seek video to frame timestamp
- [ ] Frame sorting (by brightness, hue, contrast)

### v0.06 — MONTAGE MODE
- [ ] Select/deselect frames for inclusion
- [ ] Drag-and-drop frame reordering
- [ ] Set clip duration (1-5 seconds per frame)
- [ ] Export XML/EDL for After Effects / Premiere
- [ ] Auto-generate rough cut from selections

### v0.07
- [ ] Palette extraction per frame
- [ ] Dominant color analysis
- [ ] Scene change detection

### v0.08
- [ ] Multiple video comparison
- [ ] Timeline view
- [ ] Frame bookmarking

### Separate Tools
- **PALETTE EXTRACTOR** — Color analysis from video/images
- **SCENE DETECTOR** — Automatic scene boundary detection
- **MONTAGE EDITOR** — Full-featured rough cut tool with XML export

---

## 🐛 Known Limitations

1. **FPS Detection**: Uses estimated 30fps (HTML5 Video API doesn't expose actual FPS)
2. **Large Videos**: May cause memory issues with 200+ frames at full quality
3. **Codec Support**: Depends on browser's video codec support
4. **CORS**: Remote videos require proper CORS headers

---

## 📁 Data Structures

### Frame Object
```javascript
{
  time: 12.5,           // Timestamp in seconds
  frameNumber: 375,     // Estimated frame number
  dataUrl: "data:..."   // Base64 JPEG image
}
```

### Export Canvas Layout
```
┌────────────────────────────────────────────────┐
│ ● FRAMEGRID  filename.mp4 · 1920×1080 · 02:34  │ ← Header (44px)
├────────┬────────┬────────┬────────┬────────────┤
│ INFO   │ Frame  │ Frame  │ Frame  │ ...        │
│ CARD   │   1    │   2    │   3    │            │
│        │ 00:01  │ 00:02  │ 00:03  │            │
├────────┼────────┼────────┼────────┼────────────┤
│ Frame  │ Frame  │ Frame  │ Frame  │ ...        │
│   4    │   5    │   6    │   7    │            │
│ 00:04  │ 00:05  │ 00:06  │ 00:07  │            │
└────────┴────────┴────────┴────────┴────────────┘
```

---

## 🔄 Version History

### v0.04 (Current)
- Timecode overlay moved ON TOP of frame (no separate bar below)
- Improved auto-fit algorithm for better screen filling
- Increased limits: 1000 frames, 50 columns
- Font size range: 2-28px (default 10px)
- Default mode: Every 3 seconds
- Default quality: Half resolution
- Info card hidden by default
- Uniform spacing (timecode no longer affects gap)

### v0.03
- Added About section with credits
- Fixed mouse pan behavior
- Added font size slider (8-28px)
- Added spacing slider (0-20px)
- Added quality selector (Full/Half/Quarter)
- Added Info Card with video metadata
- Added collapsible menu sections
- Changed cursor to crosshair

### v0.02
- Added auto-fit grid to screen
- Added frame count mode
- Added metadata bar toggle
- Added JPEG small export (2048px max)
- Added file creation date display
- Fixed pan to left mouse button only

### v0.01
- Initial release
- Basic frame extraction
- Grid display with zoom/pan
- PNG export
- Three selection modes

---

## 📜 License

© 2025 Grisha Tsvetkov. All rights reserved.

---

## 🔗 Links

- **Website**: [grisha-tsvetkov.com](https://www.grisha-tsvetkov.com)
- **Instagram**: [@grisha.tsvet](https://www.instagram.com/grisha.tsvet)
