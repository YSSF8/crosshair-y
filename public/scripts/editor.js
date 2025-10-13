const { ipcRenderer } = require('electron');
const fs = require('fs');

document.addEventListener('DOMContentLoaded', () => {

    const canvasContainer = document.getElementById('canvas-container');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    let editorSVG = document.getElementById('editor-svg');
    let overlaySVG = document.getElementById('editor-overlay');
    const propertiesPanel = document.getElementById('properties-panel');
    const palettePanel = document.getElementById('palette-panel');
    const toolButtons = document.querySelectorAll('.tool-button');

    const propFill = document.getElementById('prop-fill');
    const propStroke = document.getElementById('prop-stroke');
    const propStrokeWidth = document.getElementById('prop-stroke-width');

    const SVG_NS = "http://www.w3.org/2000/svg";

    const state = {
        currentTool: 'select',
        selectedElement: null,
        activeContextMenu: null,
        isDrawing: false,
        isDragging: false,
        startPoint: { x: 0, y: 0 },
        dragContext: {
            initialTx: 0,
            initialTy: 0,
        },
        currentPath: null,
        pathStep: 0,
        selectionBox: null,
        filePath: null,
        zoom: 1,
        baseViewBox: null,
    };

    function getSVGPoint(svg, x, y) {
        const pt = svg.createSVGPoint();
        pt.x = x;
        pt.y = y;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    class UndoManager {
        constructor() {
            this.undoStack = [];
            this.redoStack = [];
            this.limit = 50;
        }

        recordState() {
            this.redoStack = [];

            const currentState = editorSVG.innerHTML;

            if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === currentState) {
                return;
            }

            this.undoStack.push(currentState);

            if (this.undoStack.length > this.limit) {
                this.undoStack.shift();
            }
        }

        undo() {
            if (this.undoStack.length <= 1) {
                console.log('Undo stack empty or at initial state.');
                return;
            }

            const currentState = this.undoStack.pop();
            this.redoStack.push(currentState);

            const previousState = this.undoStack[this.undoStack.length - 1];
            this.applyState(previousState);
        }

        redo() {
            if (this.redoStack.length === 0) {
                console.log('Redo stack empty.');
                return;
            }

            const nextState = this.redoStack.pop();
            this.undoStack.push(nextState);

            this.applyState(nextState);
        }

        applyState(svgInnerHTML) {
            editorSVG.innerHTML = svgInnerHTML;

            deselectElement();
            extractAndBuildPalette();
        }
    }

    const undoManager = new UndoManager();

    function init() {
        setupToolbox();
        setupCanvasListeners();
        setupPropertiesPanel();
        ipcRenderer.on('load-file', (event, filePath) => loadSVG(filePath));
        setBaseViewBoxFromEditor();
        setupZoomControls();
        undoManager.recordState();
    }

    function loadSVG(filePath) {
        try {
            state.filePath = filePath;
            const svgContent = fs.readFileSync(filePath, 'utf-8');

            canvasWrapper.innerHTML = svgContent + '<svg id="editor-overlay" xmlns="http://www.w3.org/2000/svg"></svg>';

            editorSVG = document.getElementById(canvasWrapper.firstElementChild.id);
            if (!editorSVG) throw new Error("Could not find main SVG element after load.");
            if (!editorSVG.getAttribute('viewBox')) {
                editorSVG.setAttribute('viewBox', `0 0 ${editorSVG.getAttribute('width')} ${editorSVG.getAttribute('height')}`);
            }

            overlaySVG = document.getElementById('editor-overlay');
            if (!overlaySVG) throw new Error("Could not find overlay SVG element after load.");

            overlaySVG.setAttribute('viewBox', editorSVG.getAttribute('viewBox'));
            overlaySVG.setAttribute('preserveAspectRatio', editorSVG.getAttribute('preserveAspectRatio') || 'xMinYMin meet');
            overlaySVG.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            `;

            extractAndBuildPalette();
            deselectElement();
            setBaseViewBoxFromEditor();
        } catch (error) {
            console.error('Failed to load SVG:', error);
            alert('Could not load SVG file.');
        }
    }

    function extractAndBuildPalette() {
        const colors = new Set();
        const allElements = editorSVG.querySelectorAll('path, rect, circle, ellipse, line, text');

        allElements.forEach(el => {
            const fill = getComputedStyle(el).fill;
            const stroke = getComputedStyle(el).stroke;

            if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') {
                colors.add(fill);
            }
            if (stroke && stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)') {
                colors.add(stroke);
            }
        });

        palettePanel.innerHTML = '';
        colors.forEach(createColorSwatch);
    }

    function createColorSwatch(color) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';

        const preview = document.createElement('div');
        preview.className = 'color-swatch-preview';
        preview.style.backgroundColor = color;

        const label = document.createElement('span');
        label.className = 'color-swatch-label';
        label.textContent = color;

        swatch.append(preview, label);
        palettePanel.appendChild(swatch);

        swatch.addEventListener('click', () => {
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = color.startsWith('rgb') ? rgbToHex(color) : color;

            let liveColor = color;

            const handleLiveInput = (e) => {
                const newColorHex = e.target.value;
                updateAllColors(liveColor, newColorHex, false);
                preview.style.backgroundColor = newColorHex;
                liveColor = getComputedStyle(preview).backgroundColor;
            };

            const handleFinalChange = (e) => {
                const finalColorHex = e.target.value;
                updateAllColors(liveColor, finalColorHex, true);
            };

            const handleCleanup = () => {
                colorPicker.removeEventListener('input', handleLiveInput);
                colorPicker.removeEventListener('change', handleFinalChange);
                colorPicker.removeEventListener('blur', handleCleanup);
                document.body.removeChild(colorPicker);
            };

            colorPicker.addEventListener('input', handleLiveInput);
            colorPicker.addEventListener('change', handleFinalChange);
            colorPicker.addEventListener('blur', handleCleanup);

            colorPicker.style.position = 'fixed';
            colorPicker.style.top = '-100px';
            document.body.appendChild(colorPicker);
            colorPicker.click();
        });
    }

    function updateAllColors(oldColorRgb, newColorHex, rebuildPalette = true) {
        undoManager.recordState();

        const elementsToUpdate = [];
        editorSVG.querySelectorAll('*').forEach(el => {
            if (getComputedStyle(el).fill === oldColorRgb) {
                elementsToUpdate.push({ element: el, property: 'fill' });
            }
            if (getComputedStyle(el).stroke === oldColorRgb) {
                elementsToUpdate.push({ element: el, property: 'stroke' });
            }
        });

        elementsToUpdate.forEach(item => {
            const { element, property } = item;
            if (element.style[property]) {
                element.style[property] = newColorHex;
            } else {
                element.setAttribute(property, newColorHex);
            }
        });

        if (rebuildPalette) {
            extractAndBuildPalette();
        }
    }

    function rgbToHex(rgb) {
        let match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return '#000000';
        let [r, g, b] = match.slice(1).map(Number);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    function setupToolbox() {
        toolButtons.forEach(button => {
            button.addEventListener('click', () => {
                if (state.currentPath) {
                    finalizeElement();
                }

                toolButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                state.currentTool = button.dataset.tool;

                deselectElement();

                state.pathStep = 0;
            });
        });
    }

    function getTargetElement(wrapperOrEl) {
        if (!wrapperOrEl) return null;
        const el = wrapperOrEl;
        if (el.tagName && el.tagName.toLowerCase() === 'g' && el.dataset.resizeWrapper === '1') {
            return el.firstElementChild || el;
        }
        return el;
    }

    state.defaults = {
        fill: propFill.value || '#cccccc',
        stroke: propStroke.value || '#333333',
        strokeWidth: propStrokeWidth.value || '1',
    };

    function setupPropertiesPanel() {
        propertiesPanel.addEventListener('input', e => {
            const { id, value } = e.target;

            undoManager.recordState();

            function applyPropertyToTarget(target, propName, value) {
                const jsProp = propName === 'stroke-width' ? 'strokeWidth' : propName;

                if (target.hasAttribute && target.hasAttribute('style') && target.style && target.style[jsProp]) {
                    target.style[jsProp] = value;
                } else {
                    target.setAttribute(propName, value);
                    if (target.style && target.style[jsProp]) {
                        target.style[jsProp] = '';
                    }
                }
            }

            if (state.selectedElement) {
                const target = getTargetElement(state.selectedElement);
                if (!target) return;

                switch (id) {
                    case 'prop-fill':
                        applyPropertyToTarget(target, 'fill', value);
                        state.defaults.fill = value;
                        break;
                    case 'prop-stroke':
                        applyPropertyToTarget(target, 'stroke', value);
                        state.defaults.stroke = value;
                        break;
                    case 'prop-stroke-width':
                        applyPropertyToTarget(target, 'stroke-width', value);
                        state.defaults.strokeWidth = value;
                        break;
                }

                updateSelectionOverlay();
                extractAndBuildPalette();
                return;
            }

            switch (id) {
                case 'prop-fill':
                    state.defaults.fill = value;
                    break;
                case 'prop-stroke':
                    state.defaults.stroke = value;
                    break;
                case 'prop-stroke-width':
                    state.defaults.strokeWidth = value;
                    break;
            }
        });
    }

    function updatePropertiesForSelection() {
        propertiesPanel.style.opacity = '1';

        const wrapper = state.selectedElement;
        const target = getTargetElement(wrapper);

        if (target) {
            let fill = getComputedStyle(target).fill || '';
            if (!fill || fill === 'none' || fill === 'rgba(0, 0, 0, 0)') fill = state.defaults.fill;

            let stroke = getComputedStyle(target).stroke || '';
            if (!stroke || stroke === 'none' || stroke === 'rgba(0, 0, 0, 0)') stroke = state.defaults.stroke;

            const sw = target.getAttribute('stroke-width') || state.defaults.strokeWidth;

            propFill.value = fill.startsWith('rgb') ? rgbToHex(fill) : fill;
            propStroke.value = stroke.startsWith('rgb') ? rgbToHex(stroke) : stroke;
            propStrokeWidth.value = sw;
        } else {
            propFill.value = state.defaults.fill;
            propStroke.value = state.defaults.stroke;
            propStrokeWidth.value = state.defaults.strokeWidth;
        }
    }

    function selectElement(element) {
        if (state.selectedElement === element) return;
        deselectElement();

        const wrapper = ensureWrapper(element);
        state.selectedElement = wrapper;

        wrapper.classList.add('selected');
        createSelectionBox(wrapper);
        setupContextMenu(wrapper);
        updatePropertiesForSelection();
    }

    function deselectElement() {
        if (state.activeContextMenu) state.activeContextMenu.destroy();
        if (state.selectionBox) state.selectionBox.remove();
        if (state.selectedElement) state.selectedElement.classList.remove('selected');
        if (state.resizeHandles) {
            state.resizeHandles.forEach(h => h.remove());
            state.resizeHandles = null;
        }

        state.selectedElement = null;
        state.selectionBox = null;
        state.activeContextMenu = null;
        updatePropertiesForSelection();
    }

    function createSelectionBox(element) {
        if (state.selectionBox) state.selectionBox.remove();
        if (state.resizeHandles) {
            state.resizeHandles.forEach(h => h.remove());
            state.resizeHandles = null;
        }

        state.selectionBox = document.createElementNS(SVG_NS, 'polygon');
        state.selectionBox.setAttribute('fill', 'none');
        state.selectionBox.setAttribute('stroke', 'var(--accent-primary)');
        state.selectionBox.setAttribute('stroke-width', '1');
        state.selectionBox.setAttribute('stroke-dasharray', '4 2');
        state.selectionBox.style.pointerEvents = 'none';

        overlaySVG.appendChild(state.selectionBox);

        createResizeHandles(element.getBBox(), '');
        updateSelectionOverlay();
    }

    function createResizeHandles(bbox, wrapperTransform) {
        const corners = [0, 1, 2, 3];
        state.resizeHandles = [];

        corners.forEach((_, i) => {
            const handle = document.createElementNS(SVG_NS, 'circle');
            handle.setAttribute('cx', 0);
            handle.setAttribute('cy', 0);
            handle.setAttribute('r', 6);
            handle.setAttribute('fill', '#fff');
            handle.setAttribute('stroke', 'var(--accent-primary)');
            handle.setAttribute('stroke-width', '1');
            handle.setAttribute('vector-effect', 'non-scaling-stroke');
            handle.setAttribute('data-resize-handle', i.toString());
            handle.style.cursor = getCursorForDirection(['nw', 'ne', 'se', 'sw'][i]);
            handle.style.pointerEvents = 'all';
            handle.addEventListener('mousedown', (e) => startResizing(e, i), { passive: false });


            overlaySVG.appendChild(handle);
            state.resizeHandles.push(handle);
        });

        updateHandlesWorld(state.selectedElement);
    }

    function getCursorForDirection(dir) {
        switch (dir) {
            case 'nw':
            case 'sw':
                return 'nwse-resize';
            case 'ne':
            case 'se':
                return 'nesw-resize';
            default:
                return 'default';
        }
    }

    function updateSelectionOverlay() {
        const wrapper = state.selectedElement;
        if (!wrapper) return;

        const bbox = wrapper.getBBox();

        const tl = localToOverlay(wrapper, bbox.x, bbox.y);
        const tr = localToOverlay(wrapper, bbox.x + bbox.width, bbox.y);
        const br = localToOverlay(wrapper, bbox.x + bbox.width, bbox.y + bbox.height);
        const bl = localToOverlay(wrapper, bbox.x, bbox.y + bbox.height);

        if (state.selectionBox) {
            const pts = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
            state.selectionBox.setAttribute('points', pts);
            state.selectionBox.removeAttribute('transform');
        }

        updateHandlesWorld(wrapper);
    }

    function localToOverlay(el, x, y) {
        const owner = el.ownerSVGElement || editorSVG;
        const pt = owner.createSVGPoint();
        pt.x = x; pt.y = y;

        const elScreenCTM = el.getScreenCTM();
        const overlayScreen = overlaySVG.getScreenCTM();

        if (elScreenCTM && overlayScreen) {
            const screenPt = pt.matrixTransform(elScreenCTM);
            return screenPt.matrixTransform(overlayScreen.inverse());
        }

        const elCTM = el.getCTM();
        const editorScreen = editorSVG.getScreenCTM();
        if (elCTM && editorScreen && overlayScreen) {
            const composite = overlayScreen.inverse().multiply(editorScreen).multiply(elCTM);
            return pt.matrixTransform(composite);
        }

        return { x, y };
    }

    function updateHandlesWorld(wrapper) {
        if (!state.resizeHandles || !state.resizeHandles.length || !wrapper) return;
        const bbox = wrapper.getBBox();

        const corners = [
            localToOverlay(wrapper, bbox.x, bbox.y),
            localToOverlay(wrapper, bbox.x + bbox.width, bbox.y),
            localToOverlay(wrapper, bbox.x, bbox.y + bbox.height),
            localToOverlay(wrapper, bbox.x + bbox.width, bbox.y + bbox.height),
        ];

        state.resizeHandles.forEach((handle, i) => {
            handle.setAttribute('cx', corners[i].x);
            handle.setAttribute('cy', corners[i].y);
            handle.removeAttribute('transform');
        });
    }

    function ensureWrapper(el) {
        const existing = el.closest && el.closest('g[data-resize-wrapper="1"]');
        if (existing) return existing;

        if (el.tagName === 'g' && el.dataset.resizeWrapper === '1') return el;

        const g = document.createElementNS(SVG_NS, 'g');
        g.dataset.resizeWrapper = '1';

        el.parentNode.insertBefore(g, el);
        g.appendChild(el);

        const t = el.getAttribute('transform');
        if (t) {
            el.removeAttribute('transform');
            g.setAttribute('transform', t);
        }
        return g;
    }

    function getTransformComponents(el) {
        const t = el.getAttribute('transform') || '';
        const comps = { tx: 0, ty: 0, sx: 1, sy: 1 };
        const tr = t.match(/translate\(\s*([\-\d.]+)(?:[ ,]\s*([\-\d.]+))?\s*\)/);
        if (tr) {
            comps.tx = parseFloat(tr[1]);
            comps.ty = parseFloat(tr[2] || 0);
        }
        const sc = t.match(/scale\(\s*([\-\d.]+)(?:[ ,]\s*([\-\d.]+))?\s*\)/);
        if (sc) {
            comps.sx = parseFloat(sc[1]);
            comps.sy = parseFloat(sc[2] || sc[1]);
        }
        return comps;
    }

    function setTransform(el, { tx = 0, ty = 0, sx = 1, sy = 1, ax = 0, ay = 0 }) {
        const parts = [];
        parts.push(`translate(${tx}, ${ty})`);
        if (ax || ay) parts.push(`translate(${ax}, ${ay})`);
        parts.push(`scale(${sx}, ${sy})`);
        if (ax || ay) parts.push(`translate(${-ax}, ${-ay})`);
        el.setAttribute('transform', parts.join(' '));
    }

    function startResizing(e, handleIndex) {
        undoManager.recordState();

        e.stopPropagation();
        e.preventDefault();

        if (!state.selectedElement) return;

        state.isResizing = true;
        state.resizeHandleIndex = handleIndex;

        const wrapper = state.selectedElement;

        const bbox = wrapper.getBBox();
        const base = getTransformComponents(wrapper);

        const anchors = [
            { ax: bbox.x + bbox.width, ay: bbox.y + bbox.height },
            { ax: bbox.x, ay: bbox.y + bbox.height },
            { ax: bbox.x + bbox.width, ay: bbox.y },
            { ax: bbox.x, ay: bbox.y }
        ];
        const { ax, ay } = anchors[handleIndex];

        state.resizeContext = {
            startPoint: getSVGPoint(editorSVG, e.clientX, e.clientY),
            startBBox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
            base,
            ax, ay
        };

        window.addEventListener('mousemove', onResizing);
        window.addEventListener('mouseup', stopResizing);
    }

    function onResizing(e) {
        if (!state.isResizing || !state.selectedElement) return;

        const wrapper = state.selectedElement;
        const pt = getSVGPoint(editorSVG, e.clientX, e.clientY);
        const { startPoint, startBBox, base, ax, ay } = state.resizeContext;

        const dxWorld = pt.x - startPoint.x;
        const dyWorld = pt.y - startPoint.y;
        const localDx = dxWorld / (base.sx || 1);
        const localDy = dyWorld / (base.sy || 1);

        let newX = startBBox.x;
        let newY = startBBox.y;
        let newW = startBBox.width;
        let newH = startBBox.height;

        switch (state.resizeHandleIndex) {
            case 0:
                newX += localDx; newY += localDy; newW -= localDx; newH -= localDy; break;
            case 1:
                newY += localDy; newW += localDx; newH -= localDy; break;
            case 2:
                newX += localDx; newW -= localDx; newH += localDy; break;
            case 3:
                newW += localDx; newH += localDy; break;
        }

        const min = 1e-3;
        if (Math.abs(newW) < min) newW = (newW < 0 ? -min : min);
        if (Math.abs(newH) < min) newH = (newH < 0 ? -min : min);

        const sx = newW / startBBox.width;
        const sy = newH / startBBox.height;

        setTransform(wrapper, {
            tx: base.tx,
            ty: base.ty,
            sx: base.sx * sx,
            sy: base.sy * sy,
            ax, ay
        });

        state.resizeContext.lastBox = { x: newX, y: newY, width: newW, height: newH };

        updateSelectionOverlay();
    }

    function stopResizing() {
        if (!state.isResizing) return;
        state.isResizing = false;

        const wrapper = state.selectedElement;
        const ctx = state.resizeContext;
        window.removeEventListener('mousemove', onResizing);
        window.removeEventListener('mouseup', stopResizing);

        if (!wrapper || !ctx) {
            state.resizeHandleIndex = null;
            state.resizeContext = null;
            return;
        }

        const target =
            wrapper.tagName.toLowerCase() === 'g' && wrapper.dataset.resizeWrapper === '1'
                ? (wrapper.firstElementChild || wrapper)
                : wrapper;

        const tag = target.tagName.toLowerCase();
        const isPrimitive = (tag === 'rect' || tag === 'ellipse' || tag === 'line' || tag === 'circle');

        if (isPrimitive && ctx.lastBox) {
            applyResize(ctx.lastBox.x, ctx.lastBox.y, ctx.lastBox.width, ctx.lastBox.height);

            setTransform(wrapper, {
                tx: ctx.base.tx,
                ty: ctx.base.ty,
                sx: ctx.base.sx,
                sy: ctx.base.sy
            });
        }

        updateSelectionOverlay();

        state.resizeHandleIndex = null;
        state.resizeContext = null;
    }

    function applyResize(x, y, w, h) {
        if (w < 1) w = 1;
        if (h < 1) h = 1;

        const target =
            state.selectedElement.tagName.toLowerCase() === 'g' && state.selectedElement.dataset.resizeWrapper === '1'
                ? state.selectedElement.firstElementChild || state.selectedElement
                : state.selectedElement;

        switch (target.tagName) {
            case 'rect':
                target.setAttribute('x', x);
                target.setAttribute('y', y);
                target.setAttribute('width', w);
                target.setAttribute('height', h);
                break;
            case 'ellipse':
                target.setAttribute('cx', x + w / 2);
                target.setAttribute('cy', y + h / 2);
                target.setAttribute('rx', w / 2);
                target.setAttribute('ry', h / 2);
                break;
            case 'line':
                target.setAttribute('x1', x);
                target.setAttribute('y1', y);
                target.setAttribute('x2', x + w);
                target.setAttribute('y2', y + h);
                break;
            case 'circle':
                const ellipse = document.createElementNS(SVG_NS, 'ellipse');

                for (let attr of target.attributes) {
                    ellipse.setAttribute(attr.name, attr.value);
                }

                ellipse.setAttribute('cx', x + w / 2);
                ellipse.setAttribute('cy', y + h / 2);
                ellipse.setAttribute('rx', w / 2);
                ellipse.setAttribute('ry', h / 2);

                ellipse.removeAttribute('r');

                target.parentNode.replaceChild(ellipse, target);

                if (state.selectedElement && state.selectedElement.contains(target)) {
                    const wrapper = state.selectedElement;
                    if (wrapper.tagName.toLowerCase() === 'g' && wrapper.dataset.resizeWrapper === '1') {
                        wrapper.removeChild(target);
                        wrapper.appendChild(ellipse);
                    } else {
                        state.selectedElement = ellipse;
                    }
                }
                break;
        }

        if (state.selectionBox) {
            const wrapper = state.selectedElement;
            const tl = localToOverlay(wrapper, x, y);
            const tr = localToOverlay(wrapper, x + w, y);
            const br = localToOverlay(wrapper, x + w, y + h);
            const bl = localToOverlay(wrapper, x, y + h);
            const pts = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
            state.selectionBox.setAttribute('points', pts);
        }

        updateHandlesWorld(state.selectedElement);

        console.log(`[APPLY RESIZE] Element: ${target.tagName} → x=${x}, y=${y}, w=${w}, h=${h}`);
    }

    function setupContextMenu(element) {
        if (state.activeContextMenu) state.activeContextMenu.destroy();
        state.activeContextMenu = new ContextMenu(element, {
            'Delete': () => {
                undoManager.recordState();
                element.remove();
                deselectElement();
                extractAndBuildPalette();
            },
            'Bring to front': () => {
                undoManager.recordState();
                editorSVG.appendChild(element);
            },
            'Send to back': () => {
                undoManager.recordState();
                editorSVG.insertBefore(element, editorSVG.firstChild);
            },
        });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Delete' && state.selectedElement) {
            undoManager.recordState();
            state.selectedElement.remove();
            deselectElement();
            extractAndBuildPalette();
        }
    });

    function setupCanvasListeners() {
        canvasContainer.addEventListener('mousedown', onMouseDown);
        canvasContainer.addEventListener('mousemove', onMouseMove);
        canvasContainer.addEventListener('mouseup', onMouseUp);
        canvasContainer.addEventListener('click', (e) => {
            if (e.target === canvasContainer || e.target === editorSVG) {
                if (state.currentTool === 'select') deselectElement();
            }
        });
    }

    function onMouseDown(e) {
        if (e.button !== 0) return;

        const handleEl = e.target.closest && e.target.closest('circle[data-resize-handle]');
        if (handleEl) {
            return;
        }

        const pt = getSVGPoint(editorSVG, e.clientX, e.clientY);
        state.startPoint = pt;

        if (state.currentTool === 'select') {
            const rawTarget = e.target.closest ? e.target.closest('path, rect, circle, ellipse, line, text, g') : null;
            if (rawTarget && editorSVG.contains(rawTarget)) {
                undoManager.recordState();

                const wrapper = rawTarget.closest && rawTarget.closest('g[data-resize-wrapper="1"]');
                selectElement(wrapper || rawTarget);
                state.isDragging = true;

                state.dragContext = {
                    startPoint: state.startPoint,
                    base: getTransformComponents(state.selectedElement)
                };
            } else {
                deselectElement();
            }
            return;
        }

        state.isDrawing = true;
        const toolActions = {
            rect: startDrawingRect,
            ellipse: startDrawingEllipse,
            line: startDrawingLine,
            path: handlePathDrawing,
        };
        toolActions[state.currentTool]?.(pt);
    }

    function onMouseMove(e) {
        const pt = getSVGPoint(editorSVG, e.clientX, e.clientY);

        if (state.isDragging && state.selectedElement) {
            const dx = pt.x - state.dragContext.startPoint.x;
            const dy = pt.y - state.dragContext.startPoint.y;

            const b = state.dragContext.base;
            setTransform(state.selectedElement, {
                tx: b.tx + dx,
                ty: b.ty + dy,
                sx: b.sx,
                sy: b.sy,
            });

            console.log(`[MOVE] Δx: ${dx.toFixed(2)}, Δy: ${dy.toFixed(2)} | New Tx/Ty: ${b.tx + dx}, ${b.ty + dy}`);

            updateSelectionOverlay();
        }

        if (!state.isDrawing) return;

        const toolActions = {
            rect: updateDrawing,
            ellipse: updateDrawing,
            line: updateDrawing,
            path: updatePath,
        };
        toolActions[state.currentTool]?.(pt);
    }

    function onMouseUp(e) {
        if (state.isDragging) {
            state.isDragging = false;
        }

        if (state.isDrawing) {
            state.isDrawing = false;
            finalizeElement();
        }
    }

    function finalizeElement() {
        if (!state.currentPath) return;

        if (state.currentPath.tagName.toLowerCase() === 'path') {
            const d = state.currentPath.getAttribute('d') || '';
            if (!/[QqLlCcSsTtAaZz]/.test(d)) {
                state.currentPath.remove();
                state.currentPath = null;
                state.pathStep = 0;
                return;
            }
        }

        undoManager.recordState();

        if (state.currentTool !== 'select') {
            selectElement(state.currentPath);
        }
        setupContextMenu(state.currentPath);
        extractAndBuildPalette();

        state.currentPath = null;
        state.pathStep = 0;
    }

    function createShape(type) {
        const shape = document.createElementNS(SVG_NS, type);

        if (type === 'path') {
            shape.setAttribute('fill', 'none');
            shape.setAttribute('stroke', propStroke.value);
            shape.setAttribute('stroke-width', propStrokeWidth.value);
            shape.setAttribute('stroke-linecap', 'round');
            shape.setAttribute('stroke-linejoin', 'round');
        } else {
            shape.setAttribute('fill', propFill.value);
            shape.setAttribute('stroke', propStroke.value);
            shape.setAttribute('stroke-width', propStrokeWidth.value);
        }

        editorSVG.appendChild(shape);
        state.currentPath = shape;
    }

    function startDrawingRect(pt) { createShape('rect'); }
    function startDrawingEllipse(pt) { createShape('ellipse'); }
    function startDrawingLine(pt) {
        createShape('line');
        state.currentPath.setAttribute('x1', pt.x);
        state.currentPath.setAttribute('y1', pt.y);
    }

    function updateDrawing(pt) {
        if (!state.currentPath) return;
        const { x, y } = state.startPoint;
        const dx = pt.x - x;
        const dy = pt.y - y;

        switch (state.currentPath.tagName) {
            case 'rect':
                state.currentPath.setAttribute('x', dx > 0 ? x : pt.x);
                state.currentPath.setAttribute('y', dy > 0 ? y : pt.y);
                state.currentPath.setAttribute('width', Math.abs(dx));
                state.currentPath.setAttribute('height', Math.abs(dy));
                break;
            case 'ellipse':
                state.currentPath.setAttribute('cx', x + dx / 2);
                state.currentPath.setAttribute('cy', y + dy / 2);
                state.currentPath.setAttribute('rx', Math.abs(dx) / 2);
                state.currentPath.setAttribute('ry', Math.abs(dy) / 2);
                break;
            case 'line':
                state.currentPath.setAttribute('x2', pt.x);
                state.currentPath.setAttribute('y2', pt.y);
                break;
        }
    }

    function parseViewBox(svg) {
        const vb = svg.getAttribute('viewBox');
        if (vb) {
            const parts = vb.trim().split(/\s+/).map(Number);
            return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
        }
        const w = Number(svg.getAttribute('width')) || svg.clientWidth || 512;
        const h = Number(svg.getAttribute('height')) || svg.clientHeight || 512;
        return { x: 0, y: 0, w, h };
    }

    function setBaseViewBoxFromEditor() {
        state.baseViewBox = parseViewBox(editorSVG);
        if (overlaySVG) overlaySVG.setAttribute('viewBox', `${state.baseViewBox.x} ${state.baseViewBox.y} ${state.baseViewBox.w} ${state.baseViewBox.h}`);
        state.zoom = 1;
        updateZoomUI();
    }

    function applyZoom(scale, focalPoint) {
        scale = Math.max(0.1, Math.min(10, scale));
        state.zoom = scale;

        const base = state.baseViewBox;
        const newW = base.w / scale;
        const newH = base.h / scale;

        let cx, cy;
        if (focalPoint && typeof focalPoint.x === 'number') {
            cx = focalPoint.x;
            cy = focalPoint.y;
        } else {
            cx = base.x + base.w / 2;
            cy = base.y + base.h / 2;
        }

        const newX = cx - newW / 2;
        const newY = cy - newH / 2;
        editorSVG.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
        if (overlaySVG) overlaySVG.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);

        updateZoomUI();
        updateSelectionOverlay();
    }

    function updateZoomUI() {
        const slider = document.getElementById('zoom-slider');
        const label = document.getElementById('zoom-label');
        const percent = Math.round(state.zoom * 100);

        if (label) label.textContent = `${percent}%`;

        if (slider) {
            const sliderVal = Number(slider.value);
            if (Number.isNaN(sliderVal) || sliderVal !== percent) {
                slider.value = percent;
            }
        }
    }

    function fitToViewport() {
        applyZoom(1, null);
    }

    function setupZoomControls() {
        const slider = document.getElementById('zoom-slider');
        const resetBtn = document.getElementById('zoom-reset');
        const fitBtn = document.getElementById('zoom-fit');

        if (slider) {
            slider.addEventListener('change', (e) => {
                const val = Number(slider.value);
                if (Number.isNaN(val)) return;
                const scale = val / 100;

                const currentVB = parseViewBox(editorSVG);
                const focal = { x: currentVB.x + currentVB.w / 2, y: currentVB.y + currentVB.h / 2 };
                applyZoom(scale, focal);
            });
        }

        resetBtn && resetBtn.addEventListener('click', () => applyZoom(1));
        fitBtn && fitBtn.addEventListener('click', () => fitToViewport());

        canvasContainer.addEventListener('wheel', (ev) => {
            if (!ev.ctrlKey) return;
            ev.preventDefault();
            const factor = ev.deltaY < 0 ? 1.125 : 1 / 1.125;
            const newScale = state.zoom * factor;
            const pt = getSVGPoint(editorSVG, ev.clientX, ev.clientY);
            applyZoom(newScale, pt);
        }, { passive: false });
    }

    function handlePathDrawing(pt) {
        if (state.pathStep === 0) {
            createShape('path');
            state.currentPath.setAttribute('d', `M ${pt.x} ${pt.y}`);
            state.pathStep = 1;
        }
    }

    function updatePath(pt) {
        if (!state.currentPath || state.pathStep !== 1) return;
        const { x, y } = state.startPoint;
        const midX = (x + pt.x) / 2;
        const midY = (y + pt.y) / 2;
        const dx = pt.x - x;
        const dy = pt.y - y;
        const controlX = midX - dy * 0.4;
        const controlY = midY + dx * 0.4;

        state.currentPath.setAttribute('d', `M ${x} ${y} Q ${controlX} ${controlY} ${pt.x} ${pt.y}`);
    }

    function serializeEditorSVG() {
        try {
            const clone = editorSVG.cloneNode(true);

            clone.querySelectorAll('g[data-resize-wrapper="1"]').forEach(g => {
                const parent = g.parentNode;
                while (g.firstChild) parent.insertBefore(g.firstChild, g);
                parent.removeChild(g);
            });

            clone.querySelectorAll('[class]').forEach(n => {
                n.classList.remove('selected');
            });

            const xml = new XMLSerializer().serializeToString(clone);
            return '<?xml version="1.0" encoding="utf-8"?>\n' + xml;
        } catch (err) {
            console.error('serializeEditorSVG failed', err);
            return null;
        }
    }

    ipcRenderer.on('request-svg', (event, responseChannel) => {
        const xml = serializeEditorSVG();
        ipcRenderer.send(responseChannel, xml);
    });

    ipcRenderer.on('menu-undo', () => {
        undoManager.undo();
    });
    ipcRenderer.on('menu-redo', () => {
        undoManager.redo();
    });
    ipcRenderer.on('menu-delete', () => {
        if (state.selectedElement) {
            state.selectedElement.remove();
            deselectElement();
            extractAndBuildPalette();
        }
    });
    ipcRenderer.on('menu-bring-to-front', () => {
        if (state.selectedElement) {
            const wrapper = state.selectedElement;
            editorSVG.appendChild(wrapper);
            updateSelectionOverlay();
        }
    });
    ipcRenderer.on('menu-send-to-back', () => {
        if (state.selectedElement) {
            const wrapper = state.selectedElement;
            editorSVG.insertBefore(wrapper, editorSVG.firstChild);
            updateSelectionOverlay();
        }
    });
    ipcRenderer.on('menu-zoom-in', () => {
        applyZoom(Math.min(10, state.zoom * 1.125));
    });
    ipcRenderer.on('menu-zoom-out', () => {
        applyZoom(Math.max(0.1, state.zoom / 1.125));
    });

    init();
});