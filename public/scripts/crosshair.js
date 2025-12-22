const img = document.querySelector('img');
const SIMPLE_CROSSHAIR = './crosshairs/Simple.png';

let config;
try {
    config = JSON.parse(localStorage.getItem('config'));
} catch (e) {
    console.error('Config parse error', e);
}

config = config || {
    size: 40,
    hue: 0,
    opacity: 1,
    rotation: 0,
    crosshair: 'Simple.png'
};

document.addEventListener('DOMContentLoaded', () => {
    applyStyles();
});

function applyStyles() {
    if (config.hue) img.style.filter = `hue-rotate(${config.hue}deg)`;
    if (config.opacity) img.style.opacity = config.opacity;
    if (config.rotation) img.style.rotate = `${config.rotation}deg`;
}

ipcRenderer.send('load-crosshair');

ipcRenderer.on('crosshair-loaded', (event, rawPath) => {
    if (!rawPath) return;

    let srcUrl = rawPath;

    if (rawPath.includes('public/crosshairs') || rawPath.includes('public\\crosshairs')) {
        const filename = rawPath.replace(/\\/g, '/').split('/').pop();
        srcUrl = `./crosshairs/${filename}`;
    }
    else if (!rawPath.startsWith('http') && !rawPath.startsWith('file://')) {
        srcUrl = `file://${rawPath}`;
    }

    const tempImg = new Image();

    tempImg.onload = () => {
        img.src = srcUrl;
        console.log('Crosshair loaded:', srcUrl);
    };

    tempImg.onerror = () => {
        console.warn('Crosshair failed to load:', srcUrl);
        if (!srcUrl.includes('Simple.png')) {
            img.src = SIMPLE_CROSSHAIR;
        }
    };

    tempImg.src = srcUrl;
});

ipcRenderer.on('load-hue', (event, hue) => {
    config.hue = hue;
    img.style.filter = `hue-rotate(${hue}deg)`;
});

ipcRenderer.on('load-rotation', (event, rotation) => {
    config.rotation = rotation;
    img.style.rotate = `${rotation}deg`;
});

ipcRenderer.on('load-opacity', (event, opacity) => {
    config.opacity = opacity;
    img.style.opacity = opacity;
});