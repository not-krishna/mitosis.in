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
figma.ui.onmessage =  (msg: {type: string, frameId?: string, file?: string, csvContent?: string}) => {
  if (msg.type === 'export-data' && msg.frameId) {
  
    extractNode(msg.frameId).then(async (node) => {
      if (!node || node.type !== 'FRAME') {
        console.error("Frame not found");
        figma.closePlugin();
        return;
      }
      const hashNodes = node.findAll((n: any) => n.name.startsWith('#'));
      
      const headers = ['ID', ...hashNodes.map((n: any) => n.name.replace(/^#/, ''))];
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
      // Do not close plugin immediately, keep it open to show UI.
      // If you want to close it, call figma.closePlugin() here.
    });
  } else if (msg.type === 'import-data' && msg.csvContent) {
    const csvContent = msg.csvContent;
    // The UI has already read the file. Now you have the raw CSV text.
    // Parse it and do something with it here...
    console.log("Received CSV Content in plugin:", csvContent.substring(0, 50) + "...");
    
    // For now, we can notify the user that we received it
    figma.notify("Received CSV with length: " + csvContent.length);
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
