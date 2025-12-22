import { contextBridge, ipcRenderer } from 'electron';

const ipcWrapper = {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, func: (...args: any[]) => void) => {
        const subscription = (_event: any, ...args: any[]) => func({}, ...args);
        ipcRenderer.on(channel, subscription);
    },
    once: (channel: string, func: (...args: any[]) => void) => {
        ipcRenderer.once(channel, (_event, ...args) => func({}, ...args));
    },
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    },
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
};

contextBridge.exposeInMainWorld('ipcRenderer', ipcWrapper);

contextBridge.exposeInMainWorld('require', (moduleName: string) => {
    if (moduleName === 'electron') {
        return { ipcRenderer: ipcWrapper };
    }
    console.warn(`Warning: Module "${moduleName}" is not polyfilled in preload.`);
    return {};
});