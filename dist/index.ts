import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import openurl from 'openurl';
import axios from 'axios';
import childProcess from 'child_process';
import CrosshairOverlay = require('./crosshair');
import { arch, platform } from 'os';

let window: BrowserWindow;
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
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    window.setMenu(null);
    window.loadFile(path.join(app.getAppPath(), 'public', 'index.html'));

    window.on('closed', () => {
        crosshair.close();
    });
});

let builtInCrosshairs: string[];

ipcMain.on('built-in-crosshairs', async event => {
    try {
        const files = await fs.readdir(CROSSHAIRS_DIR);
        const pngFiles = files.filter(file => path.extname(file) === '.png');
        event.reply('built-in-crosshairs-response', pngFiles);

        builtInCrosshairs = pngFiles;
    } catch (err) {
        console.log(err);
    }
});

type Config = {
    size: number;
    hue: number;
    opacity: number;
    crosshair: string;
}

let customCrosshairsDir: string | null;
let customCrosshair: string | null;

ipcMain.on('onload-crosshair-directory', (event, directory) => {
    customCrosshairsDir = directory;
    if (customCrosshairsDir && customCrosshair) {
        const selectedCrosshair = getSelectedCrosshairPath();
        crosshair.setImage(selectedCrosshair || '');
    }
});

let config: Config;

function getSelectedCrosshairPath() {
    if (customCrosshair && customCrosshairsDir) {
        return path.join(customCrosshairsDir, customCrosshair);
    } else {
		if (process.platform === 'linux') {
			return path.join(CROSSHAIRS_DIR, '..', 'public', 'crosshairs', config.crosshair);
		} else if (process.platform === 'win32') {
			return path.join(CROSSHAIRS_DIR, '..', 'crosshairs', config.crosshair);
		}
    }
}

function getSelectedCrosshairFilename() {
    if (customCrosshair && customCrosshairsDir) {
        return customCrosshair;
    } else {
        return config.crosshair;
    }
}

ipcMain.on('change-custom-crosshair', (event, name) => {
    customCrosshair = name;
    if (customCrosshairsDir && customCrosshair) {
        const selectedCrosshair = getSelectedCrosshairPath();
        crosshair.setImage(selectedCrosshair || '');
    }
});

ipcMain.on('config', (event, newConfig: Config) => {
    config = newConfig;
    crosshair.size = +config.size;
    crosshair.opacity = +config.opacity;

    const selectedCrosshair = getSelectedCrosshairPath();
    crosshair.setImage(selectedCrosshair || '');
    crosshair.applyOpacity();
});

ipcMain.on('change-hue', (event, hue) => {
    crosshair.hue = +hue;
    crosshair.applyHue();
});

ipcMain.on('change-opacity', (event, opacity) => {
    crosshair.opacity = +opacity;
    crosshair.applyOpacity();
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

ipcMain.on('open-folder-dialog', async event => {
    const selectedFolder = await dialog.showOpenDialog({
        title: 'Select Directory',
        properties: ['openDirectory']
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

ipcMain.on('refresh-crosshairs', async event => {
    try {
        if (customCrosshairsDir) {
            const files = await fs.readdir(customCrosshairsDir);
            const pngFiles = files.filter(file => path.extname(file) === '.png');
            event.reply('custom-crosshairs-response', pngFiles);
        } else {
            console.log('No directory selected');
            event.reply('custom-crosshairs-response-fail');
        }
    } catch (err) {
        console.log(err);
    }
});

ipcMain.on('about-request', async event => {
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
        const url = 'https://api.github.com/repos/YSSF8/crosshair-y/releases/latest';
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