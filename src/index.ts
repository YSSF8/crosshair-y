import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    globalShortcut,
    Tray,
    Menu,
    nativeImage
} from 'electron';
import fs from 'fs/promises';
import path from 'path';
import openurl from 'openurl';
import axios from 'axios';
import childProcess from 'child_process';
import CrosshairOverlay = require('./crosshair');
import createEditorWindow from './editor';
import { arch, platform } from 'os';
import { screen } from 'electron';

let lastPosition: { x: number | undefined, y: number | undefined } = { x: undefined, y: undefined };
let window: BrowserWindow;
let tray: Tray;
const crosshair = new CrosshairOverlay();
const CROSSHAIRS_DIR = path.join(app.getAppPath(), 'public', 'crosshairs');

app.on('ready', () => {
    window = new BrowserWindow({
        width: 800,
        height: 500,
        minWidth: 567,
        minHeight: 393,
        autoHideMenuBar: true,
        icon: path.join(app.getAppPath(), '..', '/icon.ico'),
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    window.setMenu(null);
    window.loadFile(path.join(app.getAppPath(), 'public', 'index.html'));

    const iconPath = path.join(__dirname, '..', '/icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16 });
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show/Hide',
            click: () => {
                if (window.isVisible() && !window.isMinimized()) {
                    window.hide();
                } else {
                    showMainWindow();
                }
            }
        },
        {
            label: 'Toggle',
            click: () => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('tray-toggle');
                }
            }
        },
        {
            label: 'Quit',
            click: () => {
                window.removeAllListeners('close');
                crosshair.close();
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Crosshair Y');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => showMainWindow());

    window.on('hide', () => {
        const [x, y] = window.getPosition();
        lastPosition = { x, y };
    });

    window.on('close', (e) => {
        e.preventDefault();
        window.hide();
    });

    // Register the global shortcut for saving mouse position
    try {
        globalShortcut.register('CommandOrControl+Shift+S', () => {
            const { x, y } = screen.getCursorScreenPoint();
            if (window && !window.isDestroyed()) {
                window.webContents.send('mouse-position', { x, y });
            }
        });
        console.log('Global shortcut registered successfully: CommandOrControl+Shift+S');
    } catch (error) {
        console.error('Failed to register global shortcut: CommandOrControl+Shift+S', error);
    }

    showMainWindow();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

function showMainWindow() {
    if (lastPosition.x !== undefined && lastPosition.y !== undefined) {
        window.setPosition(lastPosition.x, lastPosition.y, false);
    }

    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
}

let builtInCrosshairs: string[];
ipcMain.on('built-in-crosshairs', async (event) => {
    try {
        const files = await fs.readdir(CROSSHAIRS_DIR);
        const pngFiles = files.filter((file) => path.extname(file) === '.png');
        event.reply('built-in-crosshairs-response', pngFiles);
        builtInCrosshairs = pngFiles;
    } catch (err) {
        console.log(err);
    }
});

type Config = {
    size: number;
    hue: number;
    rotation: number;
    opacity: number;
    crosshair: string;
    fixedPosition?: boolean;
    xPosition?: number;
    yPosition?: number;
};

let customCrosshairsDir: string | null;
let customCrosshair: string | null;

ipcMain.on('onload-crosshair-directory', (event, directory) => {
    customCrosshairsDir = directory;
    if (customCrosshairsDir && customCrosshair) {
        const selectedCrosshair = getSelectedCrosshairPath();
        crosshair.setImage(selectedCrosshair || '');
    }
});

const DEFAULT_CONFIG: Config = {
    size: 40,
    hue: 0,
    rotation: 0,
    opacity: 1,
    crosshair: 'Simple.png',
    fixedPosition: false,
    xPosition: 0,
    yPosition: 0,
};

let config: Config = { ...DEFAULT_CONFIG };

function getSelectedCrosshairPath() {
    const cfg = config ?? DEFAULT_CONFIG;
    if (customCrosshair && customCrosshairsDir) {
        return path.join(customCrosshairsDir, customCrosshair);
    } else {
        if (process.platform === 'linux') {
            return path.join(CROSSHAIRS_DIR, '..', 'public', 'crosshairs', cfg.crosshair);
        } else if (process.platform === 'win32') {
            return path.join(CROSSHAIRS_DIR, '..', 'crosshairs', cfg.crosshair);
        }
    }
}

function getSelectedCrosshairFilename() {
    const cfg = config ?? DEFAULT_CONFIG;
    return (customCrosshair && customCrosshairsDir) ? customCrosshair : cfg.crosshair;
}

ipcMain.on('change-custom-crosshair', (event, name) => {
    customCrosshair = name;

    const selectedCrosshair = getSelectedCrosshairPath();
    crosshair.setImage(selectedCrosshair || '');

    crosshair.size = +config.size;
    crosshair.hue = +config.hue;
    crosshair.rotation = +config.rotation;
    crosshair.opacity = +config.opacity;

    crosshair.applySize();
    crosshair.applyHue();
    crosshair.applyRotation();
    crosshair.applyOpacity();
});

ipcMain.on('config', (event, newConfig: Config) => {
    config = newConfig;

    const selectedCrosshair = getSelectedCrosshairPath();
    crosshair.setImage(selectedCrosshair || '');

    crosshair.size = +config.size;
    crosshair.hue = +config.hue;
    crosshair.rotation = +config.rotation;
    crosshair.opacity = +config.opacity;
    crosshair.fixedPosition = config.fixedPosition || false;
    crosshair.xPosition = config.xPosition || 0;
    crosshair.yPosition = config.yPosition || 0;

    crosshair.applySize();
    crosshair.applyHue();
    crosshair.applyRotation();
    crosshair.applyOpacity();
});

ipcMain.on('change-hue', (event, hue) => {
    crosshair.hue = +hue;
    crosshair.applyHue();
});

ipcMain.on('change-size', (event, size) => {
    crosshair.size = +size;
    crosshair.applySize();
});

ipcMain.on('change-rotation', (event, rotation) => {
    crosshair.rotation = +rotation;
    crosshair.applyRotation();
});

ipcMain.on('change-opacity', (event, opacity) => {
    crosshair.opacity = +opacity;
    crosshair.applyOpacity();
});

ipcMain.on('change-fixed-position', (event, fixedPosition) => {
    crosshair.fixedPosition = fixedPosition;
    crosshair.setBounds();
});

ipcMain.on('change-x-position', (event, xPosition) => {
    crosshair.xPosition = +xPosition;
    if (crosshair.fixedPosition) {
        crosshair.setBounds();
    }
});

ipcMain.on('change-y-position', (event, yPosition) => {
    crosshair.yPosition = +yPosition;
    if (crosshair.fixedPosition) {
        crosshair.setBounds();
    }
});

ipcMain.on('change-crosshair', (event, name) => {
    config.crosshair = name;
    customCrosshair = null;
    const crosshairFilename = getSelectedCrosshairFilename();
    crosshair.window?.webContents.send('crosshair-loaded', crosshairFilename);
});

ipcMain.on('error', (event, error) => {
    console.log(error);
});

ipcMain.on('destroy-crosshair', () => {
    crosshair.close();
});

ipcMain.on('show-crosshair', () => {
    const selectedCrosshair = getSelectedCrosshairPath();
    crosshair.open(selectedCrosshair || '');
    crosshair.show();
});

ipcMain.on('hide-crosshair', () => {
    crosshair.hide();
});

ipcMain.on('open-folder-dialog', async (event) => {
    const selectedFolder = await dialog.showOpenDialog({
        title: 'Select Directory',
        properties: ['openDirectory'],
    });
    if (!selectedFolder.canceled) {
        event.reply('custom-crosshairs-directory', selectedFolder.filePaths[0]);
    }
});

ipcMain.on('open-crosshair-directory', (event, directory) => {
    if (process.platform === 'linux') {
        childProcess.exec(`xdg-open "${directory}"`);
    } else if (process.platform === 'win32') {
        childProcess.exec(`explorer.exe "${directory}"`);
    } else if (process.platform === 'darwin') {
        childProcess.exec(`open "${directory}"`);
    }
});

ipcMain.on('refresh-crosshairs', async (event) => {
    try {
        if (customCrosshairsDir) {
            const files = await fs.readdir(customCrosshairsDir);
            const pngFiles = files.filter((file) => path.extname(file) === '.png' || path.extname(file) === '.svg');
            event.reply('custom-crosshairs-response', pngFiles);
        } else {
            console.log('No directory selected');
            event.reply('custom-crosshairs-response-fail');
        }
    } catch (err) {
        console.log(err);
    }
});

ipcMain.on('export-presets', async (event, presets) => {
    const result = await dialog.showSaveDialog({
        title: 'Export Presets',
        defaultPath: 'presets.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (!result.canceled && result.filePath) {
        try {
            await fs.writeFile(result.filePath, JSON.stringify(presets, null, 2));
            event.reply('export-presets-success', result.filePath);
        } catch (err) {
            console.error('Failed to write presets file:', err);
            event.reply('export-presets-fail', (err as Error).message);
        }
    } else {
        console.log('Export canceled');
    }
});

ipcMain.on('import-presets', async (event) => {
    const result = await dialog.showOpenDialog({
        title: 'Import Presets',
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const data = await fs.readFile(result.filePaths[0], 'utf-8');
            const presets = JSON.parse(data);
            event.reply('imported-presets', presets);
        } catch (err) {
            console.error('Failed to read presets file:', err);
            event.reply('import-presets-error', (err as Error).message);
        }
    } else {
        console.log('Import canceled');
    }
});

ipcMain.on('reveal-crosshair', (_e, fileName: string) => {
    const dir = customCrosshairsDir;
    if (!dir) return;

    const full = path.join(dir, fileName);
    if (process.platform === 'linux') {
        const fileUri = `file://${encodeURI(full)}`;

        const dbusCommand = `dbus-send --session --dest=org.freedesktop.FileManager1 --type=method_call ` +
            `/org/freedesktop/FileManager1 org.freedesktop.FileManager1.ShowItems ` +
            `array:string:"${fileUri}" string:""`;

        childProcess.exec(dbusCommand, (error, stdout, stderr) => {
            if (error) {
                console.warn(`D-Bus command failed to reveal file: ${error.message}. ` +
                    `Falling back to opening the directory with xdg-open.`);
                childProcess.exec(`xdg-open "${dir}"`, (err) => {
                    if (err) {
                        console.error(`Failed to open directory with xdg-open as fallback: ${err.message}`);
                    }
                });
            } else if (stderr) {
                console.warn(`D-Bus command had stderr output: ${stderr}`);
            }
        });
    } else if (process.platform === 'win32') {
        childProcess.exec(`explorer /select,"${full}"`);
    }
});

ipcMain.on('delete-crosshair', async (_e, fileName: string) => {
    const dir = customCrosshairsDir;
    if (!dir) return;

    const full = path.join(dir, fileName);
    try {
        await fs.unlink(full);
        window.webContents.send('refresh-crosshairs');
    } catch (err) {
        console.error(err);
    }
});

ipcMain.on('open-svg-editor', (event, filePath) => {
    const editorWindow = createEditorWindow(filePath);

    editorWindow.on('closed', () => {
        editorWindow.destroy();
    });
});

ipcMain.on('about-request', async (event) => {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    try {
        const pkg = await fs.readFile(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(pkg);
        event.reply('about-response', pkgJson);
    } catch (err) {
        console.error('Failed to read package.json:', err);
        event.reply('about-response', { error: 'Failed to read package.json' });
    }
});

ipcMain.on('download-updates', async () => {
    try {
        const url =
            'https://api.github.com/repos/YSSF8/crosshair-y/releases/latest';
        const response = await axios.get(url);
        const data = await response.data;
        const assets = data.assets;
        const operatingSystem = `${platform()}-${arch()}`;

        const promises = assets.map((asset: any) =>
            asset.browser_download_url.includes(operatingSystem)
        );

        const results = await Promise.all(promises);
        const index = results.findIndex(Boolean);

        if (index !== -1) {
            openurl.open(assets[index].browser_download_url);
        }
    } catch (err) {
        console.log(err);
        dialog.showErrorBox('Error', (err as Error).message);
    }
});
