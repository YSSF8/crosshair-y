const settings = document.querySelector('.settings');

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

settings.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = './settings.html';
    frame.classList.add('full-frame', 'full-animation');
    document.body.appendChild(frame);

    frame.addEventListener('load', () => {
        const frameDoc = frame.contentDocument || frame.contentWindow.document;
        const frameBody = frameDoc.body;
        const htmlElement = frameBody.parentElement;

        let navigationSections = {};

        frameBody.querySelectorAll('.group-title').forEach(title => {
            navigationSections[title.id] = title.textContent;
        });

        const navigationWrapper = frameBody.querySelector('.navigation-wrapper');
        const navigationTabs = frameBody.querySelector('.navigation-tabs');
        const navigationInput = frameBody.querySelector('.navigation-input');
        const searchInput = frameBody.querySelector('#search-input');
        const itemsFound = frameBody.querySelector('.items-found');
        const navButtons = frameBody.querySelector('.navigation-buttons');
        const crosshairGroupTitle = frameBody.querySelector('.group-title#crosshair');

        let searchHits = [];
        let currentIndex = -1;

        const btnPrev = navButtons.children[0];
        const btnNext = navButtons.children[1];

        const scrollToHit = idx => {
            if (!searchHits.length) return;
            currentIndex = ((idx % searchHits.length) + searchHits.length) % searchHits.length;

            searchHits.forEach((it, i) => it.classList.toggle('item-found', i === currentIndex));

            searchHits[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            itemsFound.textContent = `${currentIndex + 1}/${searchHits.length}`;
        };

        const handleSearch = debounce(() => {
            const query = searchInput.value.trim().toLowerCase();
            const allItems = [...frameBody.querySelectorAll('.item')];

            allItems.forEach(it => it.classList.remove('item-found'));
            searchHits = [];
            currentIndex = -1;

            if (!query) {
                itemsFound.textContent = '0/0';
                navButtons.classList.remove('items-are-found');
                itemsFound.classList.remove('items-are-found');
                return;
            }

            searchHits = allItems.filter(it => it.textContent.toLowerCase().includes(query));
            itemsFound.textContent = `0/${searchHits.length}`;
            navButtons.classList.toggle('items-are-found', searchHits.length > 0);
            itemsFound.classList.toggle('items-are-found', searchHits.length > 0);

            if (searchHits.length) {
                scrollToHit(0);
            }
        }, 200);

        searchInput.addEventListener('input', handleSearch);

        btnPrev.addEventListener('click', () => searchHits.length && scrollToHit(currentIndex - 1));
        btnNext.addEventListener('click', () => searchHits.length && scrollToHit(currentIndex + 1));

        searchInput.addEventListener('keydown', e => {
            if (!searchHits.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                scrollToHit(currentIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                scrollToHit(currentIndex - 1);
            }
        });

        const NAV_HEIGHT = navigationWrapper.offsetHeight + 8;

        crosshairGroupTitle.style.marginTop = `${NAV_HEIGHT}px`;

        Object.keys(navigationSections).forEach(section => {
            const tab = document.createElement('div');
            tab.classList.add('navigation-tab');
            tab.textContent = navigationSections[section];

            tab.addEventListener('click', () => {
                const targetSection = frameBody.querySelector(`#${section}`);
                if (!targetSection) return;

                const scrollTop = targetSection.offsetTop - (NAV_HEIGHT * 2.5);
                targetSection.parentElement.scrollTo({
                    top: scrollTop,
                    behavior: 'smooth'
                });
            });
            navigationTabs.appendChild(tab);
        });

        searchInput.addEventListener('focus', () => {
            navigationInput.classList.add('search-active');
        });

        searchInput.addEventListener('blur', () => {
            navigationInput.classList.remove('search-active');
        });

        if (localStorage.getItem('light-theme')) {
            htmlElement.classList.add('light-theme');
        }

        const resetButton = frameBody.querySelector('.reset');
        const closeButton = frameBody.querySelector('.close');
        const sizeRange = frameBody.querySelector('#size-range');
        const hueRange = frameBody.querySelector('#hue-range');
        const rotateRange = frameBody.querySelector('#rotate-range');
        const opacityRange = frameBody.querySelector('#opacity-range');
        const fixedPositionToggle = frameBody.querySelector('#fixed-position-toggle');
        const xPositionInput = frameBody.querySelector('#x-position-input');
        const yPositionInput = frameBody.querySelector('#y-position-input');
        const saveMousePositionButton = frameBody.querySelector('#save-mouse-position');
        const loadPresetSelect = frameBody.querySelector('#load-preset');
        const savePresetButton = frameBody.querySelector('#save-preset');
        const deletePresetBtn = frameBody.querySelector('#delete-preset');
        const deleteAllPresetsBtn = frameBody.querySelector('#delete-all-preset');
        const exportPresets = frameBody.querySelector('#export-presets');
        const importPresets = frameBody.querySelector('#import-presets');
        const setDirectory = frameBody.querySelector('#set-directory');
        const setDirectorySubText = setDirectory.querySelector('.sub-label');
        const removeDir = frameBody.querySelector('#remove-directory');
        const themeToggle = frameBody.querySelector('#theme-toggle');
        const reducedMotionSelect = frameBody.querySelector('#reduced-motion-select');
        const about = frameBody.querySelector('#about');
        const checkForUpdates = frameBody.querySelector('#check-for-updates');
        const autoUpdater = frameBody.querySelector('#auto-updates-toggle');

        if (localStorage.getItem('light-theme') === 'true') {
            htmlElement.classList.add('light-theme');
            document.documentElement.classList.add('light-theme');
            themeToggle.checked = false;
        } else {
            themeToggle.checked = true;
        }

        reducedMotionSelect.value = localStorage.getItem('reduced-motion') || 'system';
        applyReducedMotion(reducedMotionSelect.value);

        autoUpdater.checked = localStorage.getItem('auto-updates') === 'true';

        const INPUT_DEBOUNCE_DELAY = 50;

        const debouncedSendSize = debounce(value => {
            ipcRenderer.send('change-size', value);
            console.log('Debounced size change sent:', value);
        }, INPUT_DEBOUNCE_DELAY);

        if (resetButton) {
            resetButton.addEventListener('click', () => {
                localStorage.removeItem('config');
                config = { ...(typeof DEFAULT_CONFIG !== 'undefined' ? DEFAULT_CONFIG : { size: 40, hue: 0, rotation: 0, opacity: 1, crosshair: '', fixedPosition: false, xPosition: 0, yPosition: 0 }) };

                sizeRange.value = config.size;
                hueRange.value = config.hue;
                rotateRange.value = config.rotation;
                opacityRange.value = config.opacity;

                sizeRange.title = sizeRange.value;
                hueRange.title = hueRange.value;
                rotateRange.title = rotateRange.value;
                opacityRange.title = parseFloat(opacityRange.value).toFixed(1);

                fixedPositionToggle.checked = config.fixedPosition;
                xPositionInput.value = config.xPosition;
                yPositionInput.value = config.yPosition;

                xPositionInput.title = xPositionInput.value;
                yPositionInput.title = yPositionInput.value;

                ipcRenderer.send('config', config);
                ipcRenderer.send('change-size', config.size);
                ipcRenderer.send('change-hue', config.hue);
                ipcRenderer.send('change-rotation', config.rotation);
                ipcRenderer.send('change-opacity', config.opacity);
                ipcRenderer.send('change-fixed-position', config.fixedPosition);
                ipcRenderer.send('change-x-position', config.xPosition);
                ipcRenderer.send('change-y-position', config.yPosition);

                localStorage.removeItem('crosshairs-directory');
                setDirectorySubText.textContent = 'No directory';
                if (typeof openDir !== 'undefined') { openDir.title = 'No directory'; openDir.classList.add('disabled'); }
                ipcRenderer.send('onload-crosshair-directory', null);

                if (localStorage.getItem('light-theme') === 'true') {
                    document.documentElement.classList.remove('light-theme');
                    htmlElement.classList.remove('light-theme');
                    localStorage.removeItem('light-theme');
                }
                themeToggle.checked = true;

                localStorage.removeItem('reduced-motion');
                reducedMotionSelect.value = 'system';
                applyReducedMotion('system');

                if (localStorage.getItem('auto-updates') === 'true') {
                    localStorage.removeItem('auto-updates');
                }
                autoUpdater.checked = false;

                refreshOverlay();
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                frame.classList.add('full-animation');
                if (typeof container !== 'undefined') {
                    container.classList.remove('full-animation');
                } else {
                    console.warn("'container' element not found for animation.");
                }
                setTimeout(() => {
                    frame.remove();
                }, 200);
            });
        }

        sizeRange.value = config.size || 40;
        sizeRange.title = sizeRange.value;
        sizeRange.addEventListener('change', () => {
            const currentValue = sizeRange.value;
            config.size = currentValue;
            sizeRange.title = currentValue;
            localStorage.setItem('config', JSON.stringify(config));
            debouncedSendSize(currentValue);
        });

        hueRange.value = config.hue || 0;
        hueRange.title = hueRange.value;
        hueRange.addEventListener('change', () => {
            config.hue = hueRange.value;
            localStorage.setItem('config', JSON.stringify(config));
            ipcRenderer.send('change-hue', hueRange.value);
            hueRange.title = hueRange.value;
        });

        rotateRange.value = config.rotation || 0;
        rotateRange.title = rotateRange.value;
        rotateRange.addEventListener('change', () => {
            config.rotation = rotateRange.value;
            localStorage.setItem('config', JSON.stringify(config));
            ipcRenderer.send('change-rotation', rotateRange.value);
            rotateRange.title = rotateRange.value;
        });

        opacityRange.value = config.opacity || 1;
        opacityRange.title = parseFloat(opacityRange.value.toFixed(1));
        opacityRange.addEventListener('change', () => {
            config.opacity = opacityRange.value;
            localStorage.setItem('config', JSON.stringify(config));
            ipcRenderer.send('change-opacity', opacityRange.value);
            opacityRange.title = parseFloat(opacityRange.value.toFixed(1));
        });

        fixedPositionToggle.checked = config.fixedPosition || false;
        fixedPositionToggle.addEventListener('change', () => {
            config.fixedPosition = fixedPositionToggle.checked;
            localStorage.setItem('config', JSON.stringify(config));
            ipcRenderer.send('change-fixed-position', config.fixedPosition);
        });

        xPositionInput.value = config.xPosition || 0;
        xPositionInput.title = xPositionInput.value;
        xPositionInput.addEventListener('change', () => {
            const currentValue = parseInt(xPositionInput.value);
            config.xPosition = currentValue;
            xPositionInput.title = currentValue;
            localStorage.setItem('config', JSON.stringify(config));
            ipcRenderer.send('change-x-position', currentValue);
        });

        yPositionInput.value = config.yPosition || 0;
        yPositionInput.title = yPositionInput.value;
        yPositionInput.addEventListener('change', () => {
            const currentValue = parseInt(yPositionInput.value);
            config.yPosition = currentValue;
            yPositionInput.title = currentValue;
            localStorage.setItem('config', JSON.stringify(config));
            ipcRenderer.send('change-y-position', currentValue);
        });

        saveMousePositionButton.addEventListener('click', () => {
            ipcRenderer.send('get-mouse-position');
        });

        ipcRenderer.on('mouse-position', (event, { x, y }) => {
            config.xPosition = x;
            config.yPosition = y;
            localStorage.setItem('config', JSON.stringify(config));

            xPositionInput.value = x;
            yPositionInput.value = y;
            xPositionInput.title = x;
            yPositionInput.title = y;

            ipcRenderer.send('change-x-position', x);
            ipcRenderer.send('change-y-position', y);
        });

        function rebuildPresetList() {
            loadPresetSelect.innerHTML = '<option value="default">Default</option>';

            const presets = JSON.parse(localStorage.getItem('crosshair-presets') || '{}');
            Object.keys(presets).forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                loadPresetSelect.appendChild(opt);
            });

            loadPresetSelect._parseOptions?.();
        }

        rebuildPresetList();

        loadPresetSelect.addEventListener('change', () => {
            const selectedPreset = loadPresetSelect.value;
            if (!selectedPreset) return;

            let presetObj;
            if (selectedPreset === 'default') {
                presetObj = { ...DEFAULT_CONFIG };
            } else {
                const presets = JSON.parse(localStorage.getItem('crosshair-presets') || '{}');
                presetObj = presets[selectedPreset];
                if (!presetObj) return;
            }

            config = { ...config, ...presetObj };
            localStorage.setItem('config', JSON.stringify(config));

            sizeRange.value = config.size;
            hueRange.value = config.hue;
            rotateRange.value = config.rotation;
            opacityRange.value = config.opacity;

            sizeRange.title = sizeRange.value;
            hueRange.title = hueRange.value;
            rotateRange.title = rotateRange.value;
            opacityRange.title = parseFloat(opacityRange.value).toFixed(1);

            ipcRenderer.send('config', config);
            ipcRenderer.send('change-size', config.size);
            ipcRenderer.send('change-hue', config.hue);
            ipcRenderer.send('change-rotation', config.rotation);
            ipcRenderer.send('change-opacity', config.opacity);

            if (config.crosshair) {
                if (config.crosshair.startsWith(localStorage.getItem('crosshairs-directory') || '')) {
                    ipcRenderer.send('change-custom-crosshair', config.crosshair);
                    localStorage.setItem('custom-crosshair', config.crosshair);
                } else {
                    ipcRenderer.send('change-crosshair', config.crosshair);
                    localStorage.removeItem('custom-crosshair');
                }
            }

            refreshOverlay();
        });

        savePresetButton.addEventListener('click', () => {
            const modal = new Modal([
                {
                    element: 'div',
                    extraClass: 'modal-wrapper',
                    children: [
                        { element: 'div', text: 'Enter a name for the preset' },
                        {
                            element: 'input',
                            extraClass: 'modal-input',
                            attributes: { placeholder: 'My awesome crosshair' }
                        },
                        {
                            element: 'div',
                            extraClass: 'modal-wrapper-buttons',
                            children: [
                                {
                                    element: 'button',
                                    text: 'Save',
                                    event: 'click',
                                    eventAction: (e) => {
                                        const input = e.target.closest('.modal-foreground')
                                            .querySelector('.modal-input');
                                        const name = input.value.trim();
                                        if (!name) return;

                                        const presets = JSON.parse(localStorage.getItem('crosshair-presets') || '{}');
                                        presets[name] = { ...config };
                                        localStorage.setItem('crosshair-presets', JSON.stringify(presets));

                                        rebuildPresetList();

                                        const opt = document.createElement('option');
                                        opt.value = name;
                                        opt.textContent = name;
                                        loadPresetSelect.appendChild(opt);

                                        modal.remove();
                                    }
                                },
                                {
                                    element: 'button',
                                    text: 'Cancel',
                                    event: 'click',
                                    eventAction: () => modal.remove()
                                }
                            ]
                        }
                    ]
                }
            ]);

            setTimeout(() => {
                modal.element.querySelector('.modal-input')?.focus();
            }, 50);
        });

        deletePresetBtn?.addEventListener('click', () => {
            const selected = loadPresetSelect.value;
            if (selected === 'default') return;

            new Modal([
                {
                    element: 'div',
                    extraClass: 'modal-wrapper',
                    children: [
                        { element: 'div', text: `Delete “${selected}”?` },
                        {
                            element: 'div',
                            extraClass: 'modal-wrapper-buttons',
                            children: [
                                {
                                    element: 'button',
                                    text: 'Delete',
                                    event: 'click',
                                    eventAction: (e) => {
                                        const presets = JSON.parse(localStorage.getItem('crosshair-presets') || '{}');
                                        delete presets[selected];
                                        localStorage.setItem('crosshair-presets', JSON.stringify(presets));
                                        rebuildPresetList();
                                        e.target.closest('.modal-background').remove();
                                    }
                                },
                                { element: 'button', text: 'Cancel', event: 'click', eventAction: (e) => e.target.closest('.modal-background').remove() }
                            ]
                        }
                    ]
                }
            ]);
        });

        deleteAllPresetsBtn?.addEventListener('click', () => {
            new Modal([
                {
                    element: 'div',
                    extraClass: 'modal-wrapper',
                    children: [
                        { element: 'div', text: 'Delete ALL saved presets?' },
                        {
                            element: 'div',
                            extraClass: 'modal-wrapper-buttons',
                            children: [
                                {
                                    element: 'button',
                                    text: 'Delete All',
                                    event: 'click',
                                    eventAction: (e) => {
                                        localStorage.removeItem('crosshair-presets');
                                        rebuildPresetList();
                                        e.target.closest('.modal-background').remove();
                                    }
                                },
                                { element: 'button', text: 'Cancel', event: 'click', eventAction: (e) => e.target.closest('.modal-background').remove() }
                            ]
                        }
                    ]
                }
            ]);
        });

        exportPresets.addEventListener('action', e => {
            const presets = JSON.parse(localStorage.getItem('crosshair-presets'));

            if (e.detail.value === 'save') {
                if (presets && Object.keys(presets).length > 0) {
                    ipcRenderer.send('export-presets', presets || {});
                } else {
                    messageFromUI('No presets to export.');
                }
            } else if (e.detail.value === 'clipboard') {
                if (presets && Object.keys(presets).length > 0) {
                    navigator.clipboard.writeText(JSON.stringify(presets, null, 2))
                        .then(() => {
                            messageFromUI('Copied to clipboard.');
                        })
                        .catch(err => {
                            console.error('Failed to copy presets:', err);
                            messageFromUI('Failed to copy presets to clipboard.');
                        });
                } else {
                    messageFromUI('No presets to copy.');
                }
            }
        });

        importPresets.addEventListener('action', e => {
            if (e.detail.value === 'load') {
                ipcRenderer.send('import-presets');
                ipcRenderer.once('imported-presets', (event, presets) => {
                    if (presets && Object.keys(presets).length > 0) {
                        localStorage.setItem('crosshair-presets', JSON.stringify(presets));
                        rebuildPresetList();
                        messageFromUI('Presets imported successfully.');
                    } else {
                        messageFromUI('No presets found in the file.');
                    }
                });
                ipcMain.once('import-presets-error', (event, error) => {
                    console.error('Error importing presets:', error);
                    messageFromUI('Failed to import presets. Please check the file format.');
                });
            } else if (e.detail.value === 'clipboard') {
                navigator.clipboard.readText()
                    .then(text => {
                        try {
                            const presets = JSON.parse(text);
                            localStorage.setItem('crosshair-presets', JSON.stringify(presets));
                            rebuildPresetList();
                            messageFromUI('Presets imported from clipboard.');
                        } catch (err) {
                            console.error('Failed to parse presets from clipboard:', err);
                            messageFromUI('Invalid presets format in clipboard.');
                        }
                    })
                    .catch(err => {
                        console.error('Failed to read clipboard:', err);
                        messageFromUI('Failed to read presets from clipboard.');
                    });
            }
        });

        const messageFromUI = (message, opts = {}) => {
            const cfg = {
                okText: 'OK',
                onClose: modal => modal.remove(),
                ...opts
            };

            const modal = new Modal([
                {
                    element: 'div',
                    extraClass: 'modal-wrapper',
                    children: [
                        { element: 'div', text: message, extraClass: 'modal-message' },
                        {
                            element: 'div',
                            extraClass: 'modal-wrapper-buttons',
                            children: [
                                {
                                    element: 'button',
                                    text: cfg.okText,
                                    event: 'click',
                                    eventAction: () => cfg.onClose(modal)
                                }
                            ]
                        }
                    ]
                }
            ]);
        };

        const crosshairsDirectory = localStorage.getItem('crosshairs-directory') || '';

        if (crosshairsDirectory.trim() === '' || !crosshairsDirectory) {
            setDirectorySubText.textContent = 'No directory';
        } else {
            setDirectorySubText.textContent = crosshairsDirectory;
        }

        setDirectory.addEventListener('click', () => {
            ipcRenderer.send('open-folder-dialog');
            ipcRenderer.once('custom-crosshairs-directory', (event, directory) => {
                localStorage.setItem('crosshairs-directory', directory);

                const dir = localStorage.getItem('crosshairs-directory');
                setDirectorySubText.textContent = dir;
                if (typeof openDir !== 'undefined') {
                    openDir.title = dir;
                    openDir.classList.remove('disabled');
                } else {
                    console.warn("'openDir' element not found.");
                }

                ipcRenderer.send('onload-crosshair-directory', localStorage.getItem('crosshairs-directory') || null);
            });
        });

        removeDir.addEventListener('click', () => {
            localStorage.removeItem('crosshairs-directory');
            setDirectorySubText.textContent = 'No directory';
            if (typeof openDir !== 'undefined') {
                openDir.title = 'No directory';
                openDir.classList.add('disabled');
            } else {
                console.warn("'openDir' element not found.");
            }
            ipcRenderer.send('onload-crosshair-directory', null);
        });

        if (localStorage.getItem('light-theme')) {
            themeToggle.removeAttribute('checked');
        } else {
            themeToggle.setAttribute('checked', '');
        }

        themeToggle.addEventListener('change', () => {
            if (!themeToggle.checked) {
                document.documentElement.classList.add('light-theme');
                htmlElement.classList.add('light-theme');
                localStorage.setItem('light-theme', 'true');
            } else {
                document.documentElement.classList.remove('light-theme');
                htmlElement.classList.remove('light-theme');
                localStorage.removeItem('light-theme');
            }
        });

        reducedMotionSelect.addEventListener('change', () => {
            const val = reducedMotionSelect.value;
            localStorage.setItem('reduced-motion', val);
            applyReducedMotion(val);
        });

        about.addEventListener('click', () => {
            ipcRenderer.send('about-request');
            ipcRenderer.once('about-response', (event, info) => {
                if (!info.error) {
                    const modal = new Modal([
                        {
                            element: 'div',
                            extraClass: 'modal-wrapper',
                            children: [
                                {
                                    element: 'div',
                                    children: [
                                        {
                                            element: 'div',
                                            text: `Version: ${info.version}`
                                        },
                                        {
                                            element: 'div',
                                            text: `Author: ${info.author}`
                                        },
                                        {
                                            element: 'div',
                                            text: `License: ${info.license}`
                                        }
                                    ]
                                },
                                {
                                    element: 'div',
                                    extraClass: 'modal-wrapper-buttons',
                                    children: [
                                        {
                                            element: 'button',
                                            text: 'OK',
                                            event: 'click',
                                            eventAction: () => modal.remove()
                                        }
                                    ]
                                }
                            ]
                        }
                    ]);
                } else {
                    alert('An error occured while trying to load data.');
                }
            });
        });

        checkForUpdates.addEventListener('click', () => updatesCheck(false));

        autoUpdater.addEventListener('change', () => {
            if (autoUpdater.checked) {
                localStorage.setItem('auto-updates', true);
            } else {
                localStorage.removeItem('auto-updates');
            }
        });
    });

    setTimeout(() => {
        frame.classList.remove('full-animation');
        container.classList.add('full-animation');
    });
});
