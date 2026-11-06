const { app, BrowserWindow, Menu, protocol, net, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// A stable origin shares Local Storage between both functional pages.
protocol.registerSchemesAsPrivileged([{ scheme: 'easycook', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true
} }]);
const files = new Set(['index.html', 'planner.html', 'style.css', 'renderer.js',
  'planner.js', 'core.js', 'storage.js', 'api.js', 'ui.js',
  'data/recipes.json', 'assets/bowl.svg']);

function createWindow() {
  const win = new BrowserWindow({ width: 1360, height: 920, minWidth: 900, minHeight: 650,
    backgroundColor: '#f8f7ef', title: 'EasyCook',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, target) => {
    if (!['easycook://app/index.html', 'easycook://app/planner.html'].includes(target)) event.preventDefault();
  });
  win.loadURL('easycook://app/index.html');
}
app.whenReady().then(() => {
  protocol.handle('easycook', request => {
    const url = new URL(request.url), file = url.pathname.slice(1);
    if (url.host !== 'app' || !files.has(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(__dirname, file)).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'EasyCook', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
