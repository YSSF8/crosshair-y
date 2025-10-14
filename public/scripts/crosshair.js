const { ipcRenderer } = require('electron');

ipcRenderer.send('load-crosshair');

const img = document.querySelector('img');

let config = JSON.parse(localStorage.getItem('config')) || {
    size: 40,
    hue: 0,
    crosshair: 'Simple.png'
};

document.addEventListener('DOMContentLoaded', () => {
    img.style.filter = `hue-rotate(${config.hue})` || '';
});

const SIMPLE_CROSSHAIR = './crosshairs/Simple.png';

ipcRenderer.on('crosshair-loaded', (event, path) => {
    const newSrc = path.replace('public/crosshairs', './crosshairs');

    if (img.src !== newSrc) {
        img.src = newSrc;
    }

    if (img.src.indexOf('./crosshairs') !== -1) {
        fetch(img.src)
            .then(res => {
                if (!res.ok) {
                    console.warn('Crosshair not found, falling back to default');
                    img.src = SIMPLE_CROSSHAIR;
                }
                return res.blob();
            })
            .then(data => console.log('Data retrieved successfully', data))
            .catch((error) => {
                console.error('Error loading crosshair:', error);
                img.src = SIMPLE_CROSSHAIR;
                if (!path.includes('Simple.png')) {
                    alert('An error occurred while trying to load crosshair');
                }
            });
    }
});

ipcRenderer.on('load-hue', (event, hue) => {
    img.style.filter = `hue-rotate(${hue}deg)`;
});

ipcRenderer.on('load-rotation', (event, rotation) => {
    img.style.rotate = `${rotation}deg`;
});

ipcRenderer.on('load-opacity', (event, opacity) => {
    img.style.opacity = opacity;
});
