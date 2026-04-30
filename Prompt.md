TASK: Upgrade Mitosis.in Figma plugin (ui.html + code.ts) from its current 

panel-based UI to a node-canvas UI inspired by Figma Weave / n8n. The plugin 

already works correctly — do not break any existing generation logic. Only 

upgrade the UI layer and add new canvas features.



════════════════════════════════════════════════════════════

CONTEXT: WHAT THE PLUGIN CURRENTLY DOES

════════════════════════════════════════════════════════════



\- Figma plugin (manifest.json, code.ts → code.js, ui.html)

\- ui.html runs in a sandboxed iframe, communicates with code.ts via 

&#x20; parent.postMessage / figma.ui.onmessage

\- Current flow:

&#x20; 1. User selects a master frame (Figma FRAME or COMPONENT)

&#x20; 2. User uploads a CSV file

&#x20; 3. Plugin auto-detects column kinds (TEXT / IMAGE / COLOR / SKIP) via 

&#x20;    inferColumnKind()

&#x20; 4. User confirms/adjusts mappings on a mapping screen

&#x20; 5. Plugin clones the master frame N times, applies CSV row data to each

&#x20; 6. Supports auto-color mode (golden-angle HSL palette generation)

&#x20; 7. Supports image URL fetching (fetch in UI iframe, pass bytes to sandbox)



\- Existing message types (DO NOT RENAME):

&#x20; frames-loaded, export-data, show-mapping-screen, fetch-images, 

&#x20; images-fetched, generation-error, prepare-generation, import-mapped-data, 

&#x20; resize-ui



\- Existing functions in code.ts (DO NOT MODIFY LOGIC):

&#x20; buildMappingPlan, generateFrames, importMappedData, prepareGeneration,

&#x20; renameTargets, applyMappedValue, collectImageUrls, scanLayerOptions,

&#x20; autoColorFor, hexToRgb, rgbToHex, parseCSV, loadFonts



════════════════════════════════════════════════════════════

NEW UI ARCHITECTURE

════════════════════════════════════════════════════════════



Replace the entire ui.html with a node-canvas interface. The plugin window 

starts at width:780, height:740 (update figma.showUI call in code.ts).



LAYOUT (CSS grid, 4 zones):

┌─────────────────────────────────────────────────────┐

│  TOPBAR  (40px) — title, mode pills, window controls│

├──────┬──────────────────────────────────┬────────────┤

│ LEFT │        CANVAS (flex:1)           │   RIGHT    │

│ 48px │   dot-grid, node graph           │  180px     │

│tools │                                  │  inspector │

├──────┴──────────────────────────────────┴────────────┤

│  BOTTOM SHELF (80px) — draggable tool cards          │

└─────────────────────────────────────────────────────┘



────────────────────────────────────────────────────────

TOPBAR

────────────────────────────────────────────────────────

\- Logo mark (existing SVG brand icon, 28px)

\- Title "mitosis.in"

\- Mode pills: "Canvas" | "Mapping" | "Export" 

&#x20; (clicking switches the main view; Canvas is default)

\- Window size buttons: S / W / T (existing resize-ui logic, keep it)

\- Status dot (green = ready, amber = working, red = error)



────────────────────────────────────────────────────────

LEFT SIDEBAR (icon strip)

────────────────────────────────────────────────────────

Icons (SVG, 16×16):

\- Select tool (arrow, default active)

\- Pan tool (hand)  

\- Connect tool (line with dot endpoints)

\- Separator

\- Settings (gear, opens right panel inspector)



No labels. Tooltips via title attribute only.

Active icon gets: background:#242424, border:0.5px solid #6c63ff



────────────────────────────────────────────────────────

CANVAS

────────────────────────────────────────────────────────

Background: #0f0f0f

Dot grid: radial-gradient(circle, #2a2a2a 1px, transparent 1px) 24px 24px



NODES — 4 types, all absolutely positioned, all draggable via mousedown:



1\. MASTER NODE (purple border #6c63ff)

&#x20;  - Created automatically when frames-loaded message arrives

&#x20;  - One node per available Figma frame/component

&#x20;  - Shows: frame name, type badge, miniature preview (3 gray bars layout)

&#x20;  - Ports: right-center, bottom-center (10px circles, #6c63ff fill)

&#x20;  - Clicking selects it and populates the right inspector panel

&#x20;  - Double-clicking opens the CSV file picker (same as current "Next" button)

&#x20;  - Label above node: frame name in 10px #a09af0



2\. RESCALE NODE (amber border #f59e0b)  ← NEW FEATURE

&#x20;  - Dragged from bottom shelf onto canvas

&#x20;  - Shows: "rescale" header, ratio pill grid (1:1, 16:9, 9:16, 4:5, 3:2, 21:9)

&#x20;  - Active ratios: filled pill (#292210 bg, #f59e0b border, #fbbf24 text)

&#x20;  - Inactive ratios: gray pill (#1e1e1e bg, #333 border, #555 text)

&#x20;  - Clicking a ratio pill toggles it active/inactive

&#x20;  - Ports: left-center (input), right-center (output ×N for each active ratio)

&#x20;  - When connected to a master node on the left and output nodes on the right,

&#x20;    the generate function will clone the master frame at each active ratio size

&#x20;  - Ratio definitions:

&#x20;    { "1:1":   {w:1080, h:1080},

&#x20;      "16:9":  {w:1920, h:1080},

&#x20;      "9:16":  {w:1080, h:1920},

&#x20;      "4:5":   {w:1080, h:1350},

&#x20;      "3:2":   {w:1200, h:800},

&#x20;      "21:9":  {w:2560, h:1080} }



3\. OUTPUT NODE (green border #10b981)

&#x20;  - Auto-spawned to the right of the rescale node, one per active ratio

&#x20;  - Shows: ratio label ("1:1 output"), miniature preview bars

&#x20;  - Read-only, no ports

&#x20;  - Right-click → "Export this ratio as PNG" (sends export-ratio message)



4\. TOOL NODES (various colors, dropped from shelf)

&#x20;  - DATA node (#6c63ff) — shows CSV status, row count

&#x20;  - COLOR node (#a09af0) — shows color mode (CSV / auto HSL)

&#x20;  - FILTER node (#888) — future: filter rows before generation

&#x20;  - Each has left + right ports



CONNECTIONS (SVG overlay, pointer-events:none except port areas):

\- SVG element absolutely positioned over canvas, full size, z-index:5

\- On port mousedown: enter "connect mode", draw a live bezier path 

&#x20; following the cursor

\- On port mouseup over another compatible port: commit the connection

&#x20; as a dashed bezier path (stroke-dasharray:4 3)

\- Path formula: cubic bezier, control points offset 80px horizontally

&#x20; from each endpoint

\- Color by source node type:

&#x20; master → rescale: #6c63ff  

&#x20; rescale → output: #f59e0b  

&#x20; data → master:    #6c63ff  

&#x20; color → rescale:  #a09af0

\- Arrow marker at endpoint (use context-stroke so head inherits wire color)

\- On connection, update a JS connections\[] array:

&#x20; { fromNodeId, fromPort, toNodeId, toPort, type }



NODE DRAG:

\- mousedown on node body (not port): set dragging = true, record offset

\- mousemove: update node position, redraw all SVG connector paths

\- mouseup: stop drag

\- Store all node positions in a nodesState{} map keyed by nodeId

\- After drag, call redrawConnections() which recalculates all bezier paths

&#x20; from current port positions



────────────────────────────────────────────────────────

RIGHT INSPECTOR PANEL

────────────────────────────────────────────────────────

Shows context for the selected node. Three states:



STATE: nothing selected

&#x20; "Select a node to inspect"



STATE: master node selected

&#x20; Section "Template"

&#x20;   - Frame name (editable display only)

&#x20;   - W × H from Figma

&#x20;   - Node ID

&#x20; Section "Data"  

&#x20;   - CSV status: "no file" / "N rows loaded"

&#x20;   - \[Upload CSV] button → triggers hidden file input

&#x20;   - Row count, column count

&#x20; Section "Mapping"

&#x20;   - Summary: "N text, N image, N color columns"

&#x20;   - \[Review mappings] button → switches to Mapping mode



STATE: rescale node selected

&#x20; Section "Ratios"

&#x20;   - Same pill grid as on the node itself (in sync)

&#x20; Section "Options"

&#x20;   - Gap between frames: number input (default 80px)

&#x20;   - Grid columns: 1-6 stepper (default 3)

&#x20;   - Scale mode: dropdown "Proportional" / "Stretch" / "Fit"

&#x20; Section "Output"

&#x20;   - "Will generate N frames per ratio" live count



────────────────────────────────────────────────────────

BOTTOM SHELF

────────────────────────────────────────────────────────

Always visible. Height 80px. Background #1a1a1a, border-top 0.5px #2a2a2a.



Left label "tools" in 10px uppercase #555.



Tool cards (52×52px, #242424 bg, 0.5px #333 border, 9px radius):

&#x20; - data     — CSV rows icon

&#x20; - rescale  — resize icon  ← THE KEY ONE

&#x20; - color    — 3-circle blend icon

&#x20; - AI       — sparkle icon (future)

&#x20; - export   — download arrow icon

&#x20; \[separator]

&#x20; - filter   — lines icon

&#x20; - map      — grid icon

&#x20; \[+] button for future tools



Each card:

&#x20; - SVG icon 20×20px

&#x20; - Label 9px below

&#x20; - Connection badge (top-right circle): shows how many canvas nodes 

&#x20;   exist of this type; green when ≥1

&#x20; - draggable="true"

&#x20; - dragstart: set dataTransfer with tool type string

&#x20; - When dropped on canvas: spawn appropriate node at drop coordinates



DRAG-AND-DROP IMPLEMENTATION:

&#x20; canvas.addEventListener('dragover', e => e.preventDefault())

&#x20; canvas.addEventListener('drop', e => {

&#x20;   const toolType = e.dataTransfer.getData('toolType')

&#x20;   const rect = canvas.getBoundingClientRect()

&#x20;   spawnNode(toolType, e.clientX - rect.left, e.clientY - rect.top)

&#x20; })



────────────────────────────────────────────────────────

CANVAS MODE: "Mapping" (top pill)

────────────────────────────────────────────────────────

When user clicks "Mapping" pill in topbar:

\- Slide the canvas area out (transform: translateX(-100%)) 

\- Slide the existing mapping screen in

\- The mapping screen content is IDENTICAL to current implementation:

&#x20; same mapping cards, same kind selects, same target checkboxes

\- "Back to canvas" button returns to canvas mode

\- "Generate" button calls the same generateBtn.onclick logic



Keep ALL existing mapping screen HTML and JS exactly as-is, just wrap it

in a div.mode-panel that can be shown/hidden.



────────────────────────────────────────────────────────

CANVAS MODE: "Export" (top pill)

────────────────────────────────────────────────────────

Simple panel showing:

\- List of output nodes with ratio + frame count

\- Export format selector: PNG / PDF / SVG

\- \[Export all] button (placeholder for now, shows figma.notify)



════════════════════════════════════════════════════════

NEW code.ts ADDITIONS  

════════════════════════════════════════════════════════



Add to PluginMessage interface:

&#x20; ratioTargets?: RatioTarget\[]    // for multi-ratio generation

&#x20; gap?: number                    // canvas gap between generated frames

&#x20; gridColumns?: number            // how many columns to use



Add new interface:

&#x20; interface RatioTarget {

&#x20;   name: string        // e.g. "1:1"

&#x20;   width: number

&#x20;   height: number

&#x20; }



Add new message handler "import-multi-ratio":

&#x20; - Receives: masterFrameId, csvContent, mappings, ratioTargets\[], 

&#x20;             autoColorEnabled, autoColorTargetIds, gap, gridColumns

&#x20; - For each ratioTarget, clone the master frame, resize it to target 

&#x20;   dimensions using the constraint solver below, then run the existing 

&#x20;   generateFrames logic on that resized clone

&#x20; - Position groups of outputs by ratio on the canvas:

&#x20;   first ratio group starts at masterNode.x + masterNode.width + gap

&#x20;   each subsequent ratio group offsets downward by 

&#x20;   (masterNode.height \* scaleY) + gap \* 2

&#x20; - After all ratios, call figma.currentPage.selection = allGeneratedNodes

&#x20;   and figma.viewport.scrollAndZoomIntoView(allGeneratedNodes)



Add constraint solver function:

&#x20; function resizeFrameToRatio(

&#x20;   frame: TemplateNode, 

&#x20;   targetW: number, 

&#x20;   targetH: number,

&#x20;   scaleMode: "proportional" | "stretch" | "fit"

&#x20; ): void {

&#x20;   const scaleX = targetW / frame.width

&#x20;   const scaleY = targetH / frame.height

&#x20;   

&#x20;   // Resize the frame itself

&#x20;   frame.resize(targetW, targetH)

&#x20;   

&#x20;   // For each direct child, apply Figma constraints

&#x20;   // If node has layoutPositioning === "ABSOLUTE", apply constraint math:

&#x20;   //   LEFT constraint: node.x stays same

&#x20;   //   RIGHT constraint: node.x = targetW - (originalW - originalNodeRight)

&#x20;   //   CENTER\_HORIZONTAL: node.x = targetW/2 - node.width/2

&#x20;   //   LEFT\_RIGHT (scale): node.x \*= scaleX, node.width \*= scaleX

&#x20;   //   TOP/BOTTOM/CENTER\_VERTICAL: same pattern for Y axis

&#x20;   // If frame has layoutMode !== "NONE" (auto layout), just resize the 

&#x20;   //   frame — Figma's auto layout engine handles children automatically

&#x20;   

&#x20;   // For text nodes where scaleMode === "proportional":

&#x20;   //   if node has textAutoResize === "NONE" and new width < node.width:

&#x20;   //     set node.textAutoResize = "HEIGHT" to prevent overflow

&#x20; }



════════════════════════════════════════════════════════

VISUAL DESIGN TOKENS (for ui.html)

════════════════════════════════════════════════════════



:root {

&#x20; --bg:           #141414;

&#x20; --canvas-bg:    #0f0f0f;

&#x20; --panel:        #1a1a1a;

&#x20; --panel-2:      #242424;

&#x20; --fg:           #e0e0e0;

&#x20; --muted:        #888;

&#x20; --subtle:       #555;

&#x20; --border:       #2a2a2a;

&#x20; --border-mid:   #333;

&#x20; --accent:       #6c63ff;

&#x20; --accent-light: #a09af0;

&#x20; --amber:        #f59e0b;

&#x20; --amber-light:  #fbbf24;

&#x20; --green:        #10b981;

&#x20; --green-light:  #34d399;

&#x20; --danger:       #ef4444;

}



Font: Inter (same as current). All font sizes ≥ 11px.

No gradients, no box-shadows except 0 0 0 2px rgba() focus rings.

All borders 0.5px.

Border radius: nodes 8px, pills 4px, tool cards 9px, badges 50%.



════════════════════════════════════════════════════════

GENERATION FLOW (how existing + new connects)

════════════════════════════════════════════════════════



The generate button in the bottom-right of the right panel (or "Generate all"

button) collects the current canvas state and sends ONE message:



If rescale node exists AND has active ratios AND is connected to master:

&#x20; → send "import-multi-ratio" with ratioTargets array

&#x20; 

Else (no rescale node, same as current behavior):

&#x20; → send "import-mapped-data" (existing flow, unchanged)



This means: if the user never drags a rescale node onto the canvas, the 

plugin behaves 100% identically to the current version.



════════════════════════════════════════════════════════

WHAT TO KEEP UNCHANGED

════════════════════════════════════════════════════════



In code.ts — keep ALL of these functions exactly as-is:

&#x20; parseCSV, buildMappingPlan, scanLayerOptions, inferColumnKind,

&#x20; matchTargetsForColumn, layerLooksMappedToHeader, normalizeKey,

&#x20; keyForKind, tagForKind, renameTargets, generateFrames, 

&#x20; applyMappedValue, applySolidColorToTag, collectImageUrls,

&#x20; autoColorFor, hslToRgb, hexToRgb, rgbToHex, normalizeHex,

&#x20; rgbToTuple, loadFonts, hasFills, getFills, setFills,

&#x20; firstSolidFillHex, getLayerOption, isHexColor, isIdHeader,

&#x20; escapeCSV, getTopLevelTemplates, isTemplateNode, postGenerationError,

&#x20; extractNode, getTemplateNodeById



In ui.html — keep ALL of these intact (just moved into a mode panel):

&#x20; The mapping screen HTML structure (mapping-card, kind-select, 

&#x20; target-option checkboxes), all existing JS functions:

&#x20; renderMappingCards, renderTargets, renderMappingScreen,

&#x20; collectMappingsFromScreen, collectAutoColorTargetIds,

&#x20; updateMappingFromInputs, renderAutoColorTargets,

&#x20; populateTemplateSelect, updateNextState, setTab, updateColorMode,

&#x20; escapeHtml, normalizeKey, keyForKind, tagForKind (ui-side copies)



════════════════════════════════════════════════════════

DELIVERABLES

════════════════════════════════════════════════════════



1\. ui.html — full replacement with canvas UI as described

&#x20;  - All existing mapping screen HTML preserved inside .mode-panel.mapping

&#x20;  - All existing JS logic preserved

&#x20;  - New canvas JS added (node state, drag, connect, shelf drag-and-drop)

&#x20;  - New CSS design tokens and component styles



2\. code.ts — additions only:

&#x20;  - RatioTarget interface

&#x20;  - resizeFrameToRatio() function

&#x20;  - "import-multi-ratio" message handler in figma.ui.onmessage

&#x20;  - Updated figma.showUI dimensions to width:780, height:740



3\. code.js — recompile from code.ts (tsc -p tsconfig.json)



════════════════════════════════════════════════════════

ACCEPTANCE CRITERIA

════════════════════════════════════════════════════════



□ Plugin opens showing dark canvas with dot grid

□ Top-level Figma frames appear as draggable purple nodes on canvas

□ Dragging "rescale" card from shelf creates amber rescale node

□ Connecting master node port → rescale node port draws a dashed wire

□ Clicking ratio pills on rescale node toggles them on/off

□ Clicking "Generate all" with no rescale node → identical behavior 

&#x20; to current plugin (all existing tests pass)

□ Clicking "Generate all" WITH rescale node + 2 active ratios → 

&#x20; generates N CSV rows × 2 ratio sizes of frames on Figma canvas

□ "Mapping" pill shows existing mapping screen with all existing 

&#x20; functionality intact

□ Resize handle still works (drag bottom-right corner)

□ Window size S/W/T buttons still work

□ No TypeScript compilation errors

