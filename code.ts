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
figma.ui.onmessage =  (msg: {type: string,frameId: string}) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.


  if (msg.type === 'export-data') {
  
    extractNode(msg.frameId).then(async (node) => {
    if (!node || node.type !== 'FRAME') {
      console.error("Frame not found");
      return;
    }
    const hashNodes = node.findAll((n: any) => n.name.startsWith('#'));
    const nodeNames = hashNodes.map((n: any) => n.name);

    figma.notify("Frame name: " + node.name);

    figma.ui.postMessage({
      type: 'export-data',
      data: {
        frameName: node.name,
        columns: nodeNames
      }
    });
  });
}

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};

async function extractNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId); // Correct usage
  return node;
}
