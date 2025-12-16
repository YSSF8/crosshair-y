const { ipcRenderer } = require('electron');

ipcRenderer.send('built-in-crosshairs');

const DEFAULT_CONFIG = {
    size: 40,
    hue: 0,
    rotation: 0,
    opacity: 1,
    crosshair: 'Simple.png'
};
let config = JSON.parse(localStorage.getItem('config')) || { ...DEFAULT_CONFIG };

window.toggleCrosshairCheckbox = () => toggleCrosshair.toggle();

ipcRenderer.send('built-in-crosshairs');
ipcRenderer.send('onload-crosshair-directory', localStorage.getItem('crosshairs-directory') || null);
ipcRenderer.send('change-custom-crosshair', localStorage.getItem('custom-crosshair') || null);
ipcRenderer.send('config', config);
ipcRenderer.send('change-opacity', config.opacity || 1);

const container = document.querySelector('.container');
const builtInSection = document.getElementById('built-in');
const customSection = document.getElementById('custom');
const toggleCrosshair = document.getElementById('toggle-crosshair');
const searchCrosshairs = document.querySelector('.search-crosshairs');
const searchCrosshairsInput = document.getElementById('search-crosshairs-input');
const sortSelect = document.getElementById('sort-select');
const refreshDir = document.querySelector('.refresh-dir');
const openDir = document.querySelector('.open-dir');

function applyTheme(themeName) {
    const linkId = 'custom-theme-link';
    let linkEl = document.getElementById(linkId);
    const root = document.documentElement;

    root.classList.remove('light-theme');

    if (themeName === 'light') {
        root.classList.add('light-theme');
        if (linkEl) linkEl.remove();
    } else if (themeName === 'dark') {
        if (linkEl) linkEl.remove();
    } else {
        if (!linkEl) {
            linkEl = document.createElement('link');
            linkEl.id = linkId;
            linkEl.rel = 'stylesheet';
            document.head.appendChild(linkEl);
        }
        linkEl.href = `./style/themes/${themeName}.css`;
    }
}

let storedTheme = localStorage.getItem('app-theme');

if (!storedTheme) {
    const oldLightMode = localStorage.getItem('light-theme');
    if (oldLightMode === 'true') {
        storedTheme = 'light';
        localStorage.removeItem('light-theme');
        localStorage.setItem('app-theme', 'light');
    } else {
        storedTheme = 'dark';
    }
}

applyTheme(storedTheme);

ipcRenderer.once('built-in-crosshairs-response', (event, crosshairs) => {
    const crosshairsToElements = crosshairs.reverse().map(crosshair => `
    <div class="crosshair">
        <img src="./crosshairs/${crosshair}" draggable="false" alt="">
        <div>${crosshair.split('.')[0]}</div>
    </div>`);
    const joinedElements = crosshairsToElements.join('');
    builtInSection.innerHTML = joinedElements;

    builtInSection.querySelectorAll('.crosshair').forEach(crosshair => {
        crosshair.addEventListener('click', () => {
            const name = crosshair.querySelector('div').textContent + '.png';

            localStorage.removeItem('custom-crosshair');

            ipcRenderer.send('change-crosshair', name);
            refreshOverlay();

            config.crosshair = name;
            localStorage.setItem('config', JSON.stringify(config));

            ipcRenderer.send('change-hue', config.hue);
            ipcRenderer.send('change-rotation', config.rotation);
        });
    });
});

ipcRenderer.send('show-crosshair');

toggleCrosshair.addEventListener('change', () => {
    if (toggleCrosshair.checked) {
        ipcRenderer.send('show-crosshair');
    } else {
        ipcRenderer.send('hide-crosshair');
    }
});

document.querySelector('.header-option.toggle').addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL') {
        toggleCrosshair.toggle();
    }
});

ipcRenderer.send('change-hue', config.hue);
ipcRenderer.send('change-rotation', config.rotation);

refreshDir.addEventListener('click', () => {
    ipcRenderer.send('refresh-crosshairs');
});

refreshDir.click();

ipcRenderer.on('tray-toggle', () => {
    window.toggleCrosshairCheckbox?.();
});

openDir.title = localStorage.getItem('crosshairs-directory') || 'No directory';
if (localStorage.getItem('crosshairs-directory')) {
    openDir.classList.remove('disabled');
}

if (localStorage.getItem('auto-updates')) {
    updatesCheck(true);
}

searchCrosshairs.addEventListener('click', () => {
    searchCrosshairsInput.focus();
});

searchCrosshairsInput.addEventListener('input', updateAndRender);

let fileFormats = [];
let originalNames = [];
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];

function updateAndRender() {
    const searchTerm = searchCrosshairsInput.value.toLowerCase();
    const sortOrder = sortSelect.value;

    const filteredList = originalNames.filter(fileName =>
        fileName.split('.').slice(0, -1).join('.').toLowerCase().includes(searchTerm)
    );

    const sortedList = [...filteredList].sort((a, b) => {
        const nameA = a.split('.').slice(0, -1).join('.').toLowerCase();
        const nameB = b.split('.').slice(0, -1).join('.').toLowerCase();
        return sortOrder === 'az'
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
    });

    const favoriteItems = sortedList.filter(f => favorites.includes(f));
    const nonFavoriteItems = sortedList.filter(f => !favorites.includes(f));

    const finalList = [...favoriteItems, ...nonFavoriteItems];

    renderCustomSection(finalList);
}

function renderCustomSection(listToRender) {
    const dir = localStorage.getItem('crosshairs-directory');
    if (!dir) return;

    customSection.innerHTML = '';
    listToRender.forEach(fileName => {
        const nameOnly = fileName.split('.').slice(0, -1).join('.');
        const div = document.createElement('div');
        div.className = 'crosshair' + (favorites.includes(fileName) ? ' favorite-crosshair' : '');
        div.dataset.file = fileName;
        div.innerHTML = `
            <img src="${dir}/${fileName}" height="40" width="40" draggable="false" alt="">
            <div>${nameOnly}</div>`;
        customSection.appendChild(div);

        const isFavorite = favorites.includes(fileName);
        const favoriteLabel = isFavorite ? 'Remove from favorites' : 'Add to favorites';

        const menuItems = {
            [favoriteLabel]: () => {
                if (favorites.includes(fileName)) {
                    favorites = favorites.filter(f => f !== fileName);
                } else {
                    favorites.push(fileName);
                }
                localStorage.setItem('favorites', JSON.stringify(favorites));
                updateAndRender();
            },
            'Reveal in folder': () => ipcRenderer.send('reveal-crosshair', fileName),
            'Delete': () => {
                new Modal([
                    {
                        element: 'div',
                        extraClass: 'modal-wrapper',
                        children: [
                            { element: 'div', text: `Delete "${fileName.split('/').pop()}"?` },
                            { element: 'div', text: 'This action cannot be undone.' },
                            {
                                element: 'div',
                                extraClass: 'modal-wrapper-buttons',
                                children: [
                                    {
                                        element: 'button',
                                        text: 'Delete',
                                        event: 'click',
                                        eventAction: (e) => {
                                            const fileNameToDelete = fileName;
                                            originalNames = originalNames.filter(name => name !== fileNameToDelete);
                                            favorites = favorites.filter(name => name !== fileNameToDelete);
                                            localStorage.setItem('favorites', JSON.stringify(favorites));

                                            ipcRenderer.send('delete-crosshair', fileNameToDelete);
                                            updateAndRender();

                                            e.target.closest('.modal-background').remove();
                                            refreshDir.click();
                                        }
                                    },
                                    { element: 'button', text: 'Cancel', event: 'click', eventAction: (e) => e.target.closest('.modal-background').remove() }
                                ]
                            }
                        ]
                    }
                ]);
                document.body.lastElementChild.__modal = document.body.lastElementChild;
            }
        }

        if (fileName.toLowerCase().endsWith('.svg')) {
            menuItems['Editor'] = () => {
                console.log('Opening SVG editor for:', fileName);
                ipcRenderer.send('open-svg-editor', `${dir}/${fileName}`);
                console.log('SVG editor opened for:', fileName);
            }
        }

        new ContextMenu(div, menuItems);
    });

    attachClickHandlers();
}

function attachClickHandlers() {
    customSection.querySelectorAll('.crosshair').forEach(div => {
        div.addEventListener('click', () => {
            const clickedName = div.querySelector('div').textContent.trim();
            const match = fileFormats.find(f => f.name === clickedName);
            if (!match) return;

            const fullPath = `${match.name}.${match.format}`;
            ipcRenderer.send('change-custom-crosshair', fullPath);

            if (typeof refreshOverlay === 'function') refreshOverlay();

            if (typeof config === 'object') {
                config.crosshair = fullPath;
                localStorage.setItem('custom-crosshair', fullPath);
            }
        });
    });
}

ipcRenderer.on('crosshair-deleted-cleanup', (event, deletedFileName) => {
    const currentCustomCrosshair = localStorage.getItem('custom-crosshair');
    if (currentCustomCrosshair === deletedFileName) {
        localStorage.removeItem('custom-crosshair');
        customCrosshair = null;

        const defaultCrosshair = DEFAULT_CONFIG.crosshair;
        ipcRenderer.send('change-crosshair', defaultCrosshair);

        config.crosshair = defaultCrosshair;
        localStorage.setItem('config', JSON.stringify(config));

        refreshOverlay();
    }

    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const updatedFavorites = favorites.filter(f => f !== deletedFileName);
    localStorage.setItem('favorites', JSON.stringify(updatedFavorites));

    updateAndRender();
});

ipcRenderer.on('custom-crosshairs-response', (_event, crosshairs) => {
    originalNames = crosshairs;

    fileFormats = crosshairs.map(c => {
        const parts = c.split('.');
        return {
            name: parts.slice(0, -1).join('.'),
            format: parts.pop()
        };
    });

    updateAndRender();
});

sortSelect.addEventListener('change', () => {
    updateAndRender();
});

ipcRenderer.send('onload-crosshair-directory', localStorage.getItem('crosshairs-directory') || null);

document.querySelector('.refresh-dir').addEventListener('click', () => {
    ipcRenderer.send(
        'onload-crosshair-directory',
        localStorage.getItem('crosshairs-directory') || null
    );
});

ipcRenderer.on('custom-crosshairs-response-fail', () => {
    customSection.innerHTML = '';
});

openDir.addEventListener('click', () => {
    const directory = localStorage.getItem('crosshairs-directory');

    if (directory.trim() !== '' && directory) {
        ipcRenderer.send('open-crosshair-directory', directory);
    }
});

function applyReducedMotion(val) {
    if (val === 'on' || (val === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        document.documentElement.classList.add('reduced-motion');
    } else {
        document.documentElement.classList.remove('reduced-motion');
    }
}

applyReducedMotion(localStorage.getItem('reduced-motion') || 'system');

const savedPresets = JSON.parse(localStorage.getItem('crosshair-presets') || '{}');
ipcRenderer.send('update-tray-presets', savedPresets);

ipcRenderer.on('update-config-ui', (event, newConfig) => {
    config = newConfig;
    localStorage.setItem('config', JSON.stringify(config));
});

function refreshOverlay() {
    ipcRenderer.send('destroy-crosshair');
    ipcRenderer.send('change-hue', config.hue);
    ipcRenderer.send('change-rotation', config.rotation);
    ipcRenderer.send('change-size', config.size);
    ipcRenderer.send(toggleCrosshair.checked ? 'show-crosshair' : 'hide-crosshair');
}