// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__,{ width: 340, height: 480 });

const getTopLevelFrames = () => {
        const frames = figma.currentPage.children.filter(node => node.type === 'FRAME');
        return frames.map(f => ({ id: f.id, name: f.name }));
    };

     setTimeout(() => {
        figma.ui.postMessage({ type: 'frames-loaded', frames: getTopLevelFrames() });
    }, 100);

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
// Function to load fonts for a text node
const loadFonts = async (textNode: TextNode) => {
    if (textNode.fontName !== figma.mixed) {
        await figma.loadFontAsync(textNode.fontName as FontName);
    } else {
        const fonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
        for (const font of fonts) {
            await figma.loadFontAsync(font);
        }
    }
};

const generateFrames = async (rows: string[][], imageHashMap: Record<string, string>) => {
    const headers = rows[0];
    let lastCreatedX = 0;
    let lastCreatedY = 0;
    
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length === 0 || !row[0]) continue;
        
        const frameName = row[0]; // ID column is assumed to be the frame name
        
        // Find the original frame by name on the current page
        const originalNode = figma.currentPage.children.find(n => n.name === frameName && n.type === 'FRAME') as FrameNode | undefined;
        
        if (!originalNode) {
            console.error(`Frame "${frameName}" not found on the current page.`);
            continue;
        }
        
        const duplicate = originalNode.clone();
        
        // Position the duplicate so they don't overlap completely
        if (r === 1) {
            lastCreatedX = originalNode.x + originalNode.width + 100;
            lastCreatedY = originalNode.y;
        } else {
            lastCreatedY += originalNode.height + 50;
        }
        duplicate.x = lastCreatedX;
        duplicate.y = lastCreatedY;
        duplicate.name = `${originalNode.name} - Generated`;
        
        for (let c = 1; c < headers.length; c++) {
            const header = headers[c] ? headers[c].trim() : "";
            const value = (row[c] || "").trim();
            
            if (!header || !value) continue; // If value is empty, it keeps the original frame value
            
            // Find nodes in duplicate that match this header
            const targetNodes = duplicate.findAll((n: any) => n.name === header);
            
            if (targetNodes.length === 0) {
                console.log(`Warning: Could not find any layer named "${header}" in the frame.`);
            }
            
            for (const targetNode of targetNodes) {
                if (targetNode.type === 'TEXT') {
                    // Load fonts first
                    await loadFonts(targetNode as TextNode);
                    (targetNode as TextNode).characters = value;
                } else if ('fills' in targetNode) {
                    // If the value is a URL and we fetched the image successfully
                    if (value.startsWith('http://') || value.startsWith('https://')) {
                        if (imageHashMap[value]) {
                            const hash = imageHashMap[value];
                            targetNode.fills = [{
                                type: 'IMAGE',
                                scaleMode: 'FILL',
                                imageHash: hash
                            }];
                        } else {
                            console.error(`Failed to apply image for ${header}. The URL may be invalid or blocked by CORS: ${value}`);
                        }
                    }
                }
            }
        }
    }
    figma.notify("Frames generated successfully!");
};

figma.ui.onmessage =  (msg: {type: string, frameId?: string, file?: string, csvContent?: string, urls?: string[], imageBytesMap?: any, rows?: any}) => {
  if (msg.type === 'export-data' && msg.frameId) {
  
    extractNode(msg.frameId).then(async (node) => {
      if (!node || node.type !== 'FRAME') {
        console.error("Frame not found");
        figma.closePlugin();
        return;
      }
      const hashNodes = node.findAll((n: any) => n.name.startsWith('#'));
      
      const headers = ['ID', ...hashNodes.map((n: any) => n.name)];
      const values = [node.name, ...hashNodes.map((n: any) => {
        if (n.type === 'TEXT') {
          return n.characters;
        }
        return '';
      })];

      const exportCSV = (nodeName: string, headers: string[], values: string[]) => {
        const escapeCSV = (str: string) => {
            if (typeof str !== 'string') str = String(str);
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };
        
        const csvContent = headers.map(escapeCSV).join(',') + '\n' + values.map(escapeCSV).join(',');
        
        figma.ui.postMessage({
          type: 'export-data',
          data: {
            frameName: nodeName,
            csvContent: csvContent
          }
        });
      }

      exportCSV(node.name, headers, values);
    });
  } else if (msg.type === 'import-data' && msg.csvContent) {
    const csvContent = msg.csvContent;
    console.log("Received CSV Content in plugin");
    
    // Simple CSV parser that handles quotes and newlines
    const parseCSV = (text: string) => {
        const result: string[][] = [];
        let row: string[] = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (inQuotes) {
                if (char === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        field += '"';
                        i++; // skip next quote
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    row.push(field);
                    field = '';
                } else if (char === '\n' || char === '\r') {
                    if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                        i++; // skip \n
                    }
                    row.push(field);
                    result.push(row);
                    row = [];
                    field = '';
                } else {
                    field += char;
                }
            }
        }
        if (field || row.length > 0) {
            row.push(field);
            result.push(row);
        }
        return result;
    };

    const rows = parseCSV(csvContent);
    if (rows.length < 2) {
        figma.notify("CSV must have at least a header row and one data row.");
        return;
    }

    const headers = rows[0];
    
    const urlsToFetch = new Set<string>();
    for (let r = 1; r < rows.length; r++) {
        for (let c = 1; c < headers.length; c++) {
            const value = (rows[r][c] || "").trim();
            if (value && (value.startsWith('http://') || value.startsWith('https://'))) {
                urlsToFetch.add(value);
            }
        }
    }
    
    if (urlsToFetch.size > 0) {
        figma.ui.postMessage({ type: 'fetch-images', urls: Array.from(urlsToFetch), rows: rows });
    } else {
        generateFrames(rows, {}).catch(err => {
            console.error(err);
            figma.notify("Error generating frames. See console.");
        });
    }
  } else if (msg.type === 'images-fetched' && msg.imageBytesMap && msg.rows) {
      const imageBytesMap = msg.imageBytesMap;
      const rows = msg.rows;
      
      const imageHashMap: Record<string, string> = {};
      for (const url in imageBytesMap) {
          const bytes = imageBytesMap[url];
          const figmaImage = figma.createImage(new Uint8Array(bytes));
          imageHashMap[url] = figmaImage.hash;
      }
      
      generateFrames(rows, imageHashMap).catch(err => {
          console.error(err);
          figma.notify("Error generating frames. See console.");
      });
  } else {
    // Make sure to close the plugin when you're done. Otherwise the plugin will
    // keep running, which shows the cancel button at the bottom of the screen.
    figma.closePlugin();
  }
};

async function extractNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId); // Correct usage
  return node;
}
