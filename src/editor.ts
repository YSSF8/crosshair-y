import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let globalClipboardHasContent = false;

function createEditorWindow(filePath: string) {
    const editorWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    (editorWindow as any)._filePath = filePath ?? null;
    (editorWindow as any)._originalFilePath = filePath ?? null;

    editorWindow.maximize();

    editorWindow.loadFile('public/editor.html');
    editorWindow.webContents.on('did-finish-load', () => {
        if (filePath) {
            editorWindow.webContents.send('load-file', filePath);
        }
    });

    ipcMain.on('clipboard-state-changed', (event, hasContent: boolean) => {
        globalClipboardHasContent = hasContent;
        updateAppMenu();
    });

    buildAppMenu();
    return editorWindow;
}

export = createEditorWindow;

function buildAppMenu() {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: async () => { await handleSave(); }
                },
                {
                    label: 'Save As…',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: async () => { await handleSaveAs(); }
                },
                {
                    label: 'Save Clone',
                    click: async () => { await handleSaveClone(); }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: 'CmdOrCtrl+Q',
                    role: 'quit'
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => { sendToFocusedWindow('menu-undo'); }
                },
                {
                    label: 'Redo',
                    accelerator: 'CmdOrCtrl+Y',
                    click: () => { sendToFocusedWindow('menu-redo'); }
                },
                { type: 'separator' },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    click: () => { sendToFocusedWindow('menu-cut'); }
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    click: () => { sendToFocusedWindow('menu-copy'); }
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    enabled: globalClipboardHasContent,
                    click: () => {
                        if (globalClipboardHasContent) {
                            sendToFocusedWindow('menu-paste');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Delete',
                    accelerator: 'Delete',
                    click: () => { sendToFocusedWindow('menu-delete'); }
                },
                { type: 'separator' },
                {
                    label: 'Bring to front',
                    click: () => { sendToFocusedWindow('menu-bring-to-front'); }
                },
                {
                    label: 'Send to back',
                    click: () => { sendToFocusedWindow('menu-send-to-back'); }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+=',
                    click: () => { sendToFocusedWindow('menu-zoom-in'); }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => { sendToFocusedWindow('menu-zoom-out'); }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    console.log('App menu built, Paste enabled:', globalClipboardHasContent);
}

function updateAppMenu() {
    buildAppMenu();
}

function sendToFocusedWindow(channel: string, ...args: any[]) {
    const fw = BrowserWindow.getFocusedWindow();
    if (!fw) return;
    fw.webContents.send(channel, ...args);
}

async function writeSVGToPath(win: BrowserWindow, targetPath: string) {
    try {
        const svgString = await getSVGFromRenderer(win);
        fs.writeFileSync(targetPath, svgString, 'utf8');
    } catch (err: any) {
        console.error('Write failed:', err);
        dialog.showErrorBox('Write failed', (err && err.message) || 'Unknown error');
        throw err;
    }
}

function getSVGFromRenderer(win: BrowserWindow): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!win || win.isDestroyed()) return reject(new Error('No window'));
        const responseChannel = `response-svg-${win.id}-${Date.now()}`;

        const t = setTimeout(() => {
            ipcMain.removeAllListeners(responseChannel);
            reject(new Error('Timed out waiting for renderer svg'));
        }, 5000);

        ipcMain.once(responseChannel, (event, svgString: string) => {
            clearTimeout(t);
            resolve(svgString);
        });

        win.webContents.send('request-svg', responseChannel);
    });
}

async function saveWindowAndSetPath(win: BrowserWindow, targetPath: string) {
    await writeSVGToPath(win, targetPath);
    (win as any)._filePath = targetPath;
    win.webContents.send('saved-file', targetPath);
}

async function handleSave() {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    const existingPath = (win as any)._filePath;
    if (existingPath) {
        await saveWindowAndSetPath(win, existingPath);
        return;
    }
    await handleSaveAs();
}

async function handleSaveAs() {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save SVG',
        filters: [{ name: 'SVG', extensions: ['svg'] }],
        defaultPath: (win as any)._filePath || undefined,
    });
    if (canceled || !filePath) return;
    await saveWindowAndSetPath(win, filePath);
}

async function handleSaveClone() {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;

    const originalPath = (win as any)._originalFilePath;
    const currentPath = (win as any)._filePath;

    let baseDir = app.getPath('documents');
    let baseName = 'untitled.svg';

    if (originalPath) {
        baseDir = path.dirname(originalPath);
        baseName = path.basename(originalPath);
    }
    else if (currentPath) {
        baseName = path.basename(currentPath);
    }

    const parsed = path.parse(baseName);
    let attempt = 0;
    let candidate: string;
    while (true) {
        const suffix = attempt === 0 ? '-copy' : `-copy-${attempt}`;
        candidate = path.join(baseDir, `${parsed.name}${suffix}${parsed.ext}`);
        if (!fs.existsSync(candidate)) break;
        attempt++;
    }

    await writeSVGToPath(win, candidate);
    dialog.showMessageBox(win, { message: `Saved clone to:\n${candidate}` });
}