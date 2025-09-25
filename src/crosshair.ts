import { app, BrowserWindow, screen, ipcMain } from 'electron';

class CrosshairOverlay {
    public window: BrowserWindow | null = null;
    public size: number = 40;
    public hue: number = 0;
    public rotation: number = 0;
    public opacity: number = 1;
    public fixedPosition: boolean = false;
    public xPosition: number = 0;
    public yPosition: number = 0;

    constructor() { }

    async open(imagePath: string) {
        await app.whenReady();

        if (!this.window) {
            this.window = new BrowserWindow({
                width: this.size,
                height: this.size,
                frame: false,
                transparent: true,
                resizable: false,
                movable: false,
                alwaysOnTop: true,
                focusable: false,
                skipTaskbar: true,
                hasShadow: false,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                },
            });

            this.window.loadFile('./public/crosshair.html');

            const { width, height } = screen.getPrimaryDisplay().size;

            this.setBounds();

            this.window.setIgnoreMouseEvents(true);

            this.window.once('ready-to-show', () => {
                console.log('CrosshairOverlay window is ready to show');
                this.window?.show();
                this.applyOpacity();
            });

            this.window.webContents.on('did-finish-load', () => {
                this.window?.webContents.send('load-crosshair', imagePath);

                setTimeout(() => {
                    this.window?.webContents.send('load-hue', this.hue);
                    this.window?.webContents.send('load-rotation', this.rotation);
                    this.window?.webContents.send('load-opacity', this.opacity);
                }, 50);
            });

            this.window.on('closed', () => {
                this.window = null;
            });

            ipcMain.on('load-crosshair', event => {
                event.reply('crosshair-loaded', imagePath);
            });

            ipcMain.on('change-fixed-position', (event, fixedPosition) => {
                this.fixedPosition = fixedPosition;
                this.setBounds();
            });

            ipcMain.on('change-x-position', (event, xPosition) => {
                this.xPosition = xPosition;
                if (this.fixedPosition) {
                    this.setBounds();
                }
            });

            ipcMain.on('change-y-position', (event, yPosition) => {
                this.yPosition = yPosition;
                if (this.fixedPosition) {
                    this.setBounds();
                }
            });

            ipcMain.on('get-mouse-position', (event) => {
                const { x, y } = screen.getCursorScreenPoint();
                event.reply('mouse-position', { x, y });
            });
        }
    }

    setBounds() {
        if (this.window) {
            const { width, height } = screen.getPrimaryDisplay().size;
            let x = this.xPosition;
            let y = this.yPosition;

            if (this.fixedPosition) {
                x = Math.round(this.xPosition - (this.size / 2));
                y = Math.round(this.yPosition - (this.size / 2));
            } else {
                x = Math.round(width / 2 - (this.size / 2));
                y = Math.round(height / 2 - (this.size / 2));
            }

            this.window.setBounds({
                x: x,
                y: y,
                width: this.size,
                height: this.size,
            });
        }
    }

    applyHue() {
        this.window?.webContents.send('load-hue', this.hue);
    }

    applyRotation() {
        this.window?.webContents.send('load-rotation', this.rotation);
    }

    applySize() {
        if (this.window) {
            this.setBounds();
        }
    }

    applyOpacity() {
        this.window?.webContents.send('load-opacity', this.opacity);
    }

    setImage(imagePath: string) {
        if (!this.window) return;
        this.window.webContents.send('load-crosshair', imagePath);

        setTimeout(() => {
            this.window?.webContents.send('load-hue', this.hue);
            this.window?.webContents.send('load-rotation', this.rotation);
            this.window?.webContents.send('load-opacity', this.opacity);
        }, 50);
    }

    close() {
        if (this.window) {
            this.window.destroy();
        }
    }

    show() {
        if (this.window) {
            console.log('CrosshairOverlay show called');
            this.window.show();
        }
    }

    hide() {
        if (this.window) {
            console.log('CrosshairOverlay hide called');
            this.window.hide();
        }
    }
}

export = CrosshairOverlay;
