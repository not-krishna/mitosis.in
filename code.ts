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
figma.ui.onmessage =  (msg: any) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.


  if (msg.type === 'export-data') {
     figma.notify("Export triggered"); // 🔥 visible proof
        figma.getNodeByIdAsync(msg.frameId).then(node=> {
                   if (!node || node.type !== 'FRAME') {
                figma.ui.postMessage({
                    type: "error",
                    message: "Invalid frame"
                });
                return;
            }
             const hashNodes = node.findAll(n => n.name.startsWith('#'));
            console.log("FOUND NODES:", hashNodes.length);
            if (hashNodes.length === 0) {
                figma.ui.postMessage({
                    type: "error",
                    message: "No # elements found"
                });
                return;
            }
            const nodeNames = hashNodes.map((n:any) => n.name);
            // We just need to send the names to UI to generate the CSV headers
            figma.ui.postMessage({
                type: 'export-data',
                data: {
                    frameName: node.name,
                    columns: nodeNames
                }
            });
            });
          
              
            
            // Find all nested nodes starting with '#'
            // @ts-ignore
           
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};
