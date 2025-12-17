import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    globalShortcut,
    Tray,
    Menu,
    nativeImage,
    MenuItemConstructorOptions,
    screen
} from 'electron';
import fs from 'fs/promises';
import _fs from 'fs';
import path from 'path';
import openurl from 'openurl';
import axios from 'axios';
import childProcess from 'child_process';
import CrosshairOverlay = require('./crosshair');
import createEditorWindow from './editor';
import { arch, platform, release } from 'os';

let lastPosition: { x: number | undefined, y: number | undefined } = { x: undefined, y: undefined };
let window: BrowserWindow;
let tray: Tray | null = null;
const crosshair = new CrosshairOverlay();
const CROSSHAIRS_DIR = path.join(app.getAppPath(), 'public', 'crosshairs');

let isQuitting = false;

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

    window.on('hide', () => {
        const [x, y] = window.getPosition();
        lastPosition = { x, y };
    });

    window.on('close', (e) => {
        if (!isQuitting && tray && !tray.isDestroyed()) {
            e.preventDefault();
            window.hide();
        }
    });

    window.on('closed', () => {
        try {
            if (crosshair) crosshair.close();
        } catch (err) {
            console.error("Error closing crosshair:", err);
        }

        window = null as any;
        app.quit();
    });

    try {
        globalShortcut.register('CommandOrControl+Shift+S', () => {
            const { x, y } = screen.getCursorScreenPoint();
            if (window && !window.isDestroyed()) {
                window.webContents.send('mouse-position', { x, y });
            }
        });
    } catch (error) {
        console.error('Failed to register global shortcut', error);
    }

    showMainWindow();
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();

    try {
        if (crosshair) crosshair.close();
    } catch (e) {
        console.error('Error closing crosshair on will-quit:', e);
    }
});

function createTray() {
    if (tray) return;

    try {
        const iconPath = path.join(__dirname, '..', '/icon.png');
        const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16 });

        tray = new Tray(trayIcon);
        tray.setToolTip('Crosshair Y');
        tray.on('click', () => showMainWindow());

        buildTrayMenu();
    } catch (error) {
        console.error("Failed to create tray:", error);
        tray = null;
    }
}

function removeTray() {
    if (!tray) return;
    
    try {
        tray.destroy();
    } catch (e) {
        console.error(e);
    }
    tray = null;
}

ipcMain.on('toggle-tray', (event, shouldShow) => {
    const show = shouldShow === true || shouldShow === 'true';
    if (show) {
        createTray();
    } else {
        removeTray();
    }
});

let currentPresets: Record<string, Config> = {};

ipcMain.on('update-tray-presets', (event, presets) => {
    currentPresets = presets || {};
    buildTrayMenu();
});

function buildTrayMenu() {
    if (!tray || tray.isDestroyed()) return;

    const presetKeys = Object.keys(currentPresets);
    const hasPresets = presetKeys.length > 0;

    const presetMenu: MenuItemConstructorOptions[] = presetKeys.map(name => ({
        label: name,
        click: () => applyPresetFromTray(currentPresets[name])
    }));

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
        { type: 'separator' },
        {
            label: 'Presets',
            enabled: hasPresets,
            submenu: hasPresets ? presetMenu : undefined
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;

                try {
                    crosshair.close();
                } catch (e) { 
                    console.error('Error closing crosshair on quit:', e);
                }

                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

function applyPresetFromTray(presetConfig: Config) {
    config = { ...config, ...presetConfig };

    if (config.crosshair && customCrosshairsDir) {
        const possiblePath = path.join(customCrosshairsDir, config.crosshair);
        if (_fs.existsSync(possiblePath) || config.crosshair.includes(customCrosshairsDir)) {
            customCrosshair = config.crosshair.includes(path.sep) ? path.basename(config.crosshair) : config.crosshair;
        } else {
            customCrosshair = null;
        }
    } else {
        customCrosshair = null;
    }

    crosshair.size = +config.size;
    crosshair.hue = +config.hue;
    crosshair.rotation = +config.rotation;
    crosshair.opacity = +config.opacity;
    crosshair.fixedPosition = config.fixedPosition || false;
    crosshair.xPosition = config.xPosition || 0;
    crosshair.yPosition = config.yPosition || 0;

    const selectedCrosshair = getSelectedCrosshairPath();
    crosshair.close();

    if (selectedCrosshair) {
        crosshair.open(selectedCrosshair);
        crosshair.show();
    }

    crosshair.applySize();
    crosshair.applyHue();
    crosshair.applyRotation();
    crosshair.applyOpacity();
    if (config.fixedPosition) crosshair.setBounds();

    if (window && !window.isDestroyed()) {
        window.webContents.send('update-config-ui', config);
    }
}

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
        const fullPath = path.join(customCrosshairsDir, customCrosshair);

        try {
            if (_fs.existsSync(fullPath)) {
                return fullPath;
            } else {
                console.warn(`Custom crosshair not found: ${fullPath}, falling back to default`);
                customCrosshair = null;
                return path.join(CROSSHAIRS_DIR, DEFAULT_CONFIG.crosshair);
            }
        } catch (error) {
            console.error('Error checking crosshair file:', error);
            return path.join(CROSSHAIRS_DIR, DEFAULT_CONFIG.crosshair);
        }
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

ipcMain.on('get-themes', async (event) => {
    const themesDir = path.join(app.getAppPath(), 'public', 'style', 'themes');
    try {
        await fs.access(themesDir);
        const files = await fs.readdir(themesDir);
        const cssThemes = files
            .filter(file => file.endsWith('.css'))
            .map(file => file.replace('.css', ''));

        event.reply('themes-list', cssThemes);
    } catch (err) {
        console.error('Error loading themes:', err);
        event.reply('themes-list', []);
    }
});

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

ipcMain.on('apply-preset', (event, presetConfig: Config) => {
    applyPresetFromTray(presetConfig);
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

ipcMain.on('save-generated-crosshair', async (event, { name, svg }) => {
    if (!customCrosshairsDir) {
        event.reply('error', 'No custom directory set');
        return;
    }

    try {
        const fileName = name.endsWith('.svg') ? name : `${name}.svg`;
        const filePath = path.join(customCrosshairsDir, fileName);

        await fs.writeFile(filePath, svg, 'utf-8');

        event.reply('save-generated-crosshair-success');

        if (customCrosshairsDir) {
            const files = await fs.readdir(customCrosshairsDir);
            const validFiles = files.filter((file) => path.extname(file) === '.png' || path.extname(file) === '.svg');
            window.webContents.send('custom-crosshairs-response', validFiles);
        }

    } catch (err) {
        console.error('Failed to save SVG crosshair:', err);
        event.reply('error', 'Failed to save crosshair');
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

        const currentCrosshair = getSelectedCrosshairFilename();
        if (currentCrosshair === fileName) {
            customCrosshair = null;
            config.crosshair = DEFAULT_CONFIG.crosshair;

            const defaultCrosshairPath = getSelectedCrosshairPath();
            crosshair.setImage(defaultCrosshairPath || '');

            window.webContents.send('crosshair-deleted-cleanup', fileName);
        }

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