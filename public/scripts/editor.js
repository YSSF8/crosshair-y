const { ipcRenderer } = require('electron');
const fs = require('fs');

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('light-theme')) {
        document.documentElement.classList.add('light-theme');
    }

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
        selectedElements: [],
        activeContextMenu: null,
        isDrawing: false,
        isDragging: false,
        isPanning: false,
        isSpacePressed: false,
        startPoint: { x: 0, y: 0 },
        dragContext: null,
        panContext: {
            startViewBox: null,
            startMouse: null
        },
        clipboard: {
            element: null,
            type: null,
            offset: { x: 10, y: 10 }
        },
        smartGuides: {
            enabled: true,
            thresholdPx: 6,
            guides: { v: [], h: [] },
            vLine: null,
            hLine: null,
            baseAxes: null
        },
        currentPath: null,
        pathStep: 0,
        curvePoints: { p1: null, p2: null },
        selectionBox: null,
        resizeHandles: [],
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

    function injectLayerStyles() {
        const styleId = 'layer-animation-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
        .layer-item {
            position: relative;
            box-sizing: border-box;
            transition: transform 0.2s cubic-bezier(0.2, 0, 0.2, 1), 
                        background-color 0.2s ease,
                        box-shadow 0.2s ease;
            will-change: transform, top, left; 
        }

        .layer-placeholder {
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.05);
            border: 1px dashed var(--line-color);
            box-sizing: border-box;
            margin: 4px 0;
            transition: height 0.2s ease;
        }

        .layer-item.dragging {
            position: fixed !important;
            z-index: 10000;
            width: var(--drag-width);
            
            background-color: var(--secondary-color);
            border: 1px solid var(--accent-primary);
            border-radius: 4px;
            
            box-shadow: 0 8px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1);
            opacity: 0.98;
            
            pointer-events: none;
            cursor: grabbing;
            transition: none !important;
        }

        .layer-item.dropping {
            position: fixed !important;
            z-index: 10000;
            width: var(--drag-width);
            
            pointer-events: none;
            
            transition: 
                top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), 
                left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                background-color 0.3s ease,
                border-color 0.3s ease,
                box-shadow 0.3s ease !important;
        }
        
        .layer-item.dropping.active {
            background-color: var(--accent-primary) !important;
        }
    `;
        document.head.appendChild(style);
    }

    class LayerManager {
        constructor(editorSVG, layersPanel) {
            this.editorSVG = editorSVG;
            this.layersPanel = layersPanel;
            this.layers = [];
            this.activeLayer = null;
            this.nextLayerId = 1;
            this.editingLayerId = null;
            this.isEditing = false;
            this.canceledEdit = false;
            this.dragState = null;

            injectLayerStyles();
            this.init();
        }

        init() {
            this.addLayer('Layer 1');
            this.setupEventListeners();
        }

        setupEventListeners() {
            const newLayerBtn = document.getElementById('new-layer-btn');
            const renameLayerBtn = document.getElementById('rename-layer-btn');
            const deleteLayerBtn = document.getElementById('delete-layer-btn');

            const newNewLayerBtn = newLayerBtn.cloneNode(true);
            const newRenameLayerBtn = renameLayerBtn.cloneNode(true);
            const newDeleteLayerBtn = deleteLayerBtn.cloneNode(true);

            newLayerBtn.parentNode.replaceChild(newNewLayerBtn, newLayerBtn);
            renameLayerBtn.parentNode.replaceChild(newRenameLayerBtn, renameLayerBtn);
            deleteLayerBtn.parentNode.replaceChild(newDeleteLayerBtn, deleteLayerBtn);

            newNewLayerBtn.addEventListener('click', () => this.addLayer());
            newRenameLayerBtn.addEventListener('click', () => this.renameSelectedLayer());
            newDeleteLayerBtn.addEventListener('click', () => this.deleteSelectedLayer());

            document.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
        }

        handleGlobalKeyDown(e) {
            if (this.isEditing) {
                const allowedKeys = ['Escape', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete'];
                if (!allowedKeys.includes(e.key) && !(e.ctrlKey || e.metaKey) && e.key.length === 1) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }
        }

        addLayer(name = `Layer ${this.nextLayerId}`) {
            const layerId = `layer-${this.nextLayerId++}`;
            const layerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            layerGroup.setAttribute('id', layerId);
            layerGroup.setAttribute('data-layer', 'true');
            layerGroup.setAttribute('data-layer-id', layerId);
            layerGroup.setAttribute('data-layer-visible', 'true');
            this.editorSVG.appendChild(layerGroup);

            const layer = {
                id: layerId,
                name: name,
                group: layerGroup,
                visible: true,
                locked: false,
                elements: [],
                selected: false
            };

            this.layers.push(layer);
            this.renderLayers();
            this.selectLayer(layerId);
            return layer;
        }

        selectLayer(layerId) {
            if (this.isEditing) return;
            this.canceledEdit = false;
            this.layers.forEach(layer => layer.selected = false);
            const layerToSelect = this.layers.find(layer => layer.id === layerId);
            if (layerToSelect) {
                layerToSelect.selected = true;
                this.activeLayer = layerToSelect;
            }
            this.renderLayers();
        }

        getSelectedLayer() {
            return this.layers.find(layer => layer.selected) || this.layers[0];
        }

        renameSelectedLayer() {
            const selectedLayer = this.getSelectedLayer();
            if (!selectedLayer || this.isEditing) return;
            this.startEditingLayer(selectedLayer.id);
        }

        startEditingLayer(layerId) {
            if (this.canceledEdit && this.editingLayerId === layerId) {
                this.canceledEdit = false;
                return;
            }
            this.editingLayerId = layerId;
            this.isEditing = true;
            this.canceledEdit = false;
            this.renderLayers();

            setTimeout(() => {
                const editableElement = this.layersPanel.querySelector(`[data-layer-id="${layerId}"] .layer-name-editable`);
                if (editableElement) {
                    editableElement.focus();
                    this.selectAllContent(editableElement);
                }
            }, 10);
        }

        selectAllContent(element) {
            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }

        confirmRename(layerId, newName) {
            const layer = this.layers.find(l => l.id === layerId);
            if (layer && newName.trim()) {
                layer.name = newName.trim();
            }
            this.cancelRename();
        }

        cancelRename() {
            this.canceledEdit = true;
            this.editingLayerId = null;
            this.isEditing = false;
            this.renderLayers();
        }

        deleteSelectedLayer() {
            if (this.isEditing) return;
            const selectedLayer = this.getSelectedLayer();
            if (!selectedLayer || this.layers.length <= 1) return;

            if (this.deletingLayer) return;
            this.deletingLayer = true;

            if (confirm(`Are you sure you want to delete layer "${selectedLayer.name}"?`)) {
                this.performLayerDeletion(selectedLayer);
            } else {
                this.deletingLayer = false;
            }
        }

        performLayerDeletion(layerToDelete) {
            const layerIndex = this.layers.findIndex(layer => layer.id === layerToDelete.id);
            layerToDelete.group.remove();
            this.layers.splice(layerIndex, 1);
            const newIndex = Math.min(layerIndex, this.layers.length - 1);
            this.selectLayer(this.layers[newIndex].id);
            this.renderLayers();
            setTimeout(() => { this.deletingLayer = false; }, 100);
        }

        toggleLayerVisibility(layerId) {
            if (this.isEditing) return;
            const layer = this.layers.find(layer => layer.id === layerId);
            if (layer) {
                layer.visible = !layer.visible;
                layer.group.style.display = layer.visible ? '' : 'none';
                this.renderLayers();
            }
        }

        moveLayer(layerId, direction) {
            if (this.isEditing) return;
            const layerIndex = this.layers.findIndex(layer => layer.id === layerId);
            if (layerIndex === -1) return;
            let newIndex;
            if (direction === 'up' && layerIndex < this.layers.length - 1) {
                newIndex = layerIndex + 1;
            } else if (direction === 'down' && layerIndex > 0) {
                newIndex = layerIndex - 1;
            } else {
                return;
            }
            [this.layers[layerIndex], this.layers[newIndex]] = [this.layers[newIndex], this.layers[layerIndex]];
            const fragment = document.createDocumentFragment();
            this.layers.forEach(layer => fragment.appendChild(layer.group));
            this.editorSVG.appendChild(fragment);
            this.renderLayers();
        }

        getLayerForElement(element) {
            const layerGroup = element.closest('g[data-layer="true"]');
            return layerGroup ? this.layers.find(layer => layer.group === layerGroup) : null;
        }

        addElementToActiveLayer(element) {
            const activeLayer = this.getSelectedLayer();
            if (activeLayer) {
                activeLayer.group.appendChild(element);
                activeLayer.elements.push(element);
            } else {
                this.editorSVG.appendChild(element);
            }
        }

        startDrag(e, layerId) {
            const layerElement = this.layersPanel.querySelector(`[data-layer-id="${layerId}"]`);
            if (!layerElement) return;

            e.preventDefault();

            const rect = layerElement.getBoundingClientRect();

            const placeholder = document.createElement('div');
            placeholder.className = 'layer-placeholder';

            placeholder.style.height = `${rect.height}px`;

            layerElement.parentNode.insertBefore(placeholder, layerElement.nextSibling);

            layerElement.style.setProperty('--drag-width', `${rect.width}px`);

            const computedStyle = window.getComputedStyle(layerElement);
            const originalBg = computedStyle.backgroundColor;

            if (originalBg === 'rgba(0, 0, 0, 0)' || originalBg === 'transparent') {
                layerElement.style.backgroundColor = 'var(--secondary-color)';
            } else {
                layerElement.style.backgroundColor = originalBg;
            }

            layerElement.classList.add('dragging');
            document.body.appendChild(layerElement);

            const offsetY = e.clientY - rect.top;

            layerElement.style.top = `${rect.top}px`;
            layerElement.style.left = `${rect.left}px`;

            this.dragState = {
                draggedElement: layerElement,
                placeholder: placeholder,
                offsetY: offsetY,
                layerId: layerId,
                initialIndex: this.layers.findIndex(l => l.id === layerId)
            };

            this.boundDragMove = this.onDragMove.bind(this);
            this.boundDragEnd = this.onDragEnd.bind(this);

            document.addEventListener('mousemove', this.boundDragMove);
            document.addEventListener('mouseup', this.boundDragEnd);
        }

        onDragMove(e) {
            if (!this.dragState) return;
            const { draggedElement, offsetY } = this.dragState;

            draggedElement.style.top = `${e.clientY - offsetY}px`;

            this.updatePlaceholderPosition(e.clientY);
        }

        updatePlaceholderPosition(mouseY) {
            const placeholder = this.dragState.placeholder;
            const items = Array.from(this.layersPanel.querySelectorAll('.layer-item:not(.dragging)'));

            let insertBefore = null;
            for (const item of items) {
                const rect = item.getBoundingClientRect();
                const middle = rect.top + rect.height / 2;
                if (mouseY < middle) {
                    insertBefore = item;
                    break;
                }
            }

            const currentNextSibling = placeholder.nextElementSibling;
            if (insertBefore === currentNextSibling) return;

            const siblings = Array.from(this.layersPanel.children).filter(el => el !== placeholder);
            const positions = new Map();
            siblings.forEach(el => positions.set(el, el.getBoundingClientRect().top));

            if (insertBefore) {
                this.layersPanel.insertBefore(placeholder, insertBefore);
            } else {
                this.layersPanel.appendChild(placeholder);
            }

            siblings.forEach(el => {
                const newTop = el.getBoundingClientRect().top;
                const oldTop = positions.get(el);
                const delta = oldTop - newTop;
                if (delta !== 0) {
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${delta}px)`;
                }
            });

            requestAnimationFrame(() => {
                siblings.forEach(el => {
                    if (el.style.transform) {
                        el.offsetHeight;
                        el.style.transition = '';
                        el.style.transform = '';
                    }
                });
            });
        }

        onDragEnd(e) {
            if (!this.dragState) return;

            document.removeEventListener('mousemove', this.boundDragMove);
            document.removeEventListener('mouseup', this.boundDragEnd);
            this.boundDragMove = null;
            this.boundDragEnd = null;

            const { draggedElement, placeholder, layerId, initialIndex } = this.dragState;
            const destRect = placeholder.getBoundingClientRect();

            draggedElement.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)';
            draggedElement.style.borderColor = 'var(--accent-primary)';

            const currentBg = window.getComputedStyle(draggedElement).backgroundColor;
            draggedElement.style.backgroundColor = currentBg;

            draggedElement.classList.remove('dragging');
            draggedElement.classList.add('dropping');

            void draggedElement.offsetWidth;

            const onAnimationComplete = (evt) => {
                if (evt && evt.propertyName !== 'top') return;

                draggedElement.removeEventListener('transitionend', onAnimationComplete);
                if (this.dragTimeout) clearTimeout(this.dragTimeout);

                const children = Array.from(this.layersPanel.children);
                const placeholderIndex = children.indexOf(placeholder);

                if (placeholderIndex === -1) {
                    this.renderLayers();
                    if (draggedElement.parentNode) draggedElement.remove();
                    if (placeholder.parentNode) placeholder.remove();
                    this.dragState = null;
                    return;
                }

                const layerCount = this.layers.length;
                const newIndex = layerCount - 1 - placeholderIndex;
                const layerToMove = this.layers[initialIndex];
                this.layers.splice(initialIndex, 1);
                this.layers.splice(newIndex, 0, layerToMove);

                const fragment = document.createDocumentFragment();
                this.layers.forEach(layer => fragment.appendChild(layer.group));
                this.editorSVG.appendChild(fragment);

                draggedElement.remove();
                placeholder.remove();
                this.dragState = null;

                this.renderLayers();
                this.selectLayer(layerId);
            };

            draggedElement.addEventListener('transitionend', onAnimationComplete);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    draggedElement.style.top = `${destRect.top}px`;
                    draggedElement.style.left = `${destRect.left}px`;

                    draggedElement.style.boxShadow = '0 0 0 rgba(0,0,0,0)';
                    draggedElement.style.borderColor = 'transparent';
                    draggedElement.style.backgroundColor = '';
                });
            });

            this.dragTimeout = setTimeout(() => {
                if (this.dragState) onAnimationComplete();
            }, 450);
        }

        renderLayers() {
            this.layersPanel.innerHTML = '';
            [...this.layers].reverse().forEach(layer => {
                const layerElement = document.createElement('div');

                const hasSelectedElements = state.selectedElements.some(el => layer.group.contains(el));

                layerElement.className = `layer-item ${layer.selected ? 'active' : ''} ${!layer.visible ? 'is-hidden' : ''} ${this.editingLayerId === layer.id ? 'is-editing' : ''} ${hasSelectedElements ? 'is-element-selected' : ''}`;
                layerElement.setAttribute('data-layer-id', layer.id);

                const elementType = this.getLayerElementType(layer);

                if (this.editingLayerId === layer.id) {
                    layerElement.innerHTML = `
                    <div class="layer-info">
                        <svg class="layer-type-icon" viewBox="0 0 24 24">${this.getLayerIcon(elementType)}</svg>
                        <span class="layer-name-editable" contenteditable="true" data-maxlength="30">${layer.name}</span>
                        <div class="edit-controls">
                            <button class="edit-confirm" title="Confirm"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></button>
                            <button class="edit-cancel" title="Cancel"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
                        </div>
                    </div>`;

                    const editableElement = layerElement.querySelector('.layer-name-editable');
                    const confirmBtn = layerElement.querySelector('.edit-confirm');
                    const cancelBtn = layerElement.querySelector('.edit-cancel');
                    const originalName = layer.name;

                    editableElement.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
                        else if (e.key === 'Escape') { e.preventDefault(); editableElement.textContent = originalName; cancelBtn.click(); }
                        e.stopPropagation();
                    });
                    confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); this.confirmRename(layer.id, editableElement.textContent); });
                    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); editableElement.textContent = originalName; this.cancelRename(); });

                } else {
                    layerElement.innerHTML = `
                    <div class="layer-info">
                        <svg class="layer-type-icon" viewBox="0 0 24 24">${this.getLayerIcon(elementType)}</svg>
                        <span class="layer-name">${layer.name}</span>
                    </div>
                    <button class="layer-visibility-toggle" title="Toggle visibility">
                        <svg class="icon-visible" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path></svg>
                        <svg class="icon-hidden" viewBox="0 0 24 24"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"></path></svg>
                    </button>`;

                    const visibilityBtn = layerElement.querySelector('.layer-visibility-toggle');
                    visibilityBtn.addEventListener('mousedown', (e) => e.stopPropagation());
                    visibilityBtn.addEventListener('click', (e) => {
                        if (!this.isEditing && !this.canceledEdit) {
                            e.stopPropagation();
                            this.toggleLayerVisibility(layer.id);
                        }
                    });

                    if (this.editingLayerId !== layer.id && !this.isEditing && !this.canceledEdit) {
                        layerElement.addEventListener('mousedown', (e) => {
                            if (e.button !== 0 || e.target.closest('.layer-visibility-toggle')) return;
                            this.handleLayerMouseDown(e, layer.id);
                        });
                    }
                }

                this.layersPanel.appendChild(layerElement);
            });
        }

        handleLayerMouseDown(e, layerId) {
            if (e.button !== 0) return;

            this.pendingDragState = {
                layerId: layerId,
                startX: e.clientX,
                startY: e.clientY,
                hasMoved: false
            };

            this.boundMonitorDrag = this.monitorDragThreshold.bind(this);
            this.boundCancelDragMonitor = this.onPendingMouseUp.bind(this);

            document.addEventListener('mousemove', this.boundMonitorDrag);
            document.addEventListener('mouseup', this.boundCancelDragMonitor);
        }

        monitorDragThreshold(e) {
            if (!this.pendingDragState) return;

            const dx = e.clientX - this.pendingDragState.startX;
            const dy = e.clientY - this.pendingDragState.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                this.pendingDragState.hasMoved = true;

                document.removeEventListener('mousemove', this.boundMonitorDrag);
                document.removeEventListener('mouseup', this.boundCancelDragMonitor);

                this.selectLayer(this.pendingDragState.layerId);

                this.startDrag(e, this.pendingDragState.layerId);
                this.pendingDragState = null;
            }
        }

        onPendingMouseUp(e) {
            if (!this.pendingDragState) return;

            document.removeEventListener('mousemove', this.boundMonitorDrag);
            document.removeEventListener('mouseup', this.boundCancelDragMonitor);

            if (!this.pendingDragState.hasMoved) {
                this.selectLayer(this.pendingDragState.layerId);
            }

            this.pendingDragState = null;
        }

        getLayerElementType(layer) {
            const elements = layer.group.children;
            if (elements.length === 0) return 'empty';
            const types = new Set();
            for (let element of elements) {
                if (element.getAttribute('data-resize-wrapper') === '1') {
                    const child = element.firstElementChild;
                    if (child) types.add(child.tagName.toLowerCase());
                } else {
                    types.add(element.tagName.toLowerCase());
                }
            }
            if (types.size === 1) return types.values().next().value;
            return 'mixed';
        }

        getLayerIcon(type) {
            const icons = {
                'rect': '<path d="M3 5v14h18V5H3zm16 12H5V7h14v10z" fill="currentColor"/>',
                'ellipse': '<path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>',
                'circle': '<path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>',
                'path': '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>',
                'line': '<path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" fill="currentColor"/>',
                'empty': '<path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="currentColor"/>',
                'mixed': '<path d="M4 6h16v2H4zm0 4h16v2H4zm0 4h16v2H4zm0 4h16v2H4z" fill="currentColor"/>'
            };
            return icons[type] || icons['empty'];
        }
    }

    function getLayerElementType(layer) {
        const elements = layer.group.children;
        if (elements.length === 0) return 'empty';
        const types = new Set();
        for (let element of elements) {
            if (element.getAttribute('data-resize-wrapper') === '1') {
                const child = element.firstElementChild;
                if (child) types.add(child.tagName.toLowerCase());
            } else {
                types.add(element.tagName.toLowerCase());
            }
        }
        if (types.size === 1) return types.values().next().value;
        return 'mixed';
    }

    function init() {
        setupToolbox();
        setupCanvasListeners();
        setupPropertiesPanel();
        ipcRenderer.on('load-file', (event, filePath) => loadSVG(filePath));
        setBaseViewBoxFromEditor();
        setupZoomControls();
        setupSmartGuidesUI();

        state.layerManager = new LayerManager(editorSVG, document.getElementById('layers-panel'));

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

            state.layerManager = new LayerManager(editorSVG, document.getElementById('layers-panel'));

            const elements = Array.from(editorSVG.children).filter(child =>
                !child.hasAttribute('data-layer') && child.tagName !== 'defs'
            );

            elements.forEach(element => {
                state.layerManager.layers[0].group.appendChild(element);
            });

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
                if (state.currentTool === 'path' && state.pathStep > 0) {
                    if (state.currentPath) {
                        state.currentPath.remove();
                    }
                    resetPathState();
                }

                if (state.isDrawing && state.currentPath) {
                    state.currentPath.remove();
                    state.currentPath = null;
                    state.isDrawing = false;
                }

                toolButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                state.currentTool = button.dataset.tool;

                deselectElement();
            });
        });
    }

    function resetPathState() {
        state.pathStep = 0;
        state.curvePoints = { p1: null, p2: null };
        state.currentPath = null;
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

            if (state.selectedElements.length > 0) {
                state.selectedElements.forEach(wrapper => {
                    const target = getTargetElement(wrapper);
                    if (!target) return;

                    switch (id) {
                        case 'prop-fill':
                            applyPropertyToTarget(target, 'fill', value);
                            break;
                        case 'prop-stroke':
                            applyPropertyToTarget(target, 'stroke', value);
                            break;
                        case 'prop-stroke-width':
                            applyPropertyToTarget(target, 'stroke-width', value);
                            break;
                    }
                });

                if (id === 'prop-fill') state.defaults.fill = value;
                if (id === 'prop-stroke') state.defaults.stroke = value;
                if (id === 'prop-stroke-width') state.defaults.strokeWidth = value;

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
        const target = wrapper ? getTargetElement(wrapper) : null;

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

    function selectElement(element, multiSelect = false) {
        const wrapper = ensureWrapper(element);

        const targetLayer = state.layerManager.getLayerForElement(wrapper);

        const currentLayer = state.selectedElements.length > 0
            ? state.layerManager.getLayerForElement(state.selectedElements[0])
            : null;

        if (multiSelect && currentLayer && targetLayer !== currentLayer) {
            return;
        }

        if (multiSelect) {
            const index = state.selectedElements.indexOf(wrapper);
            if (index > -1) {
                wrapper.classList.remove('selected');
                state.selectedElements.splice(index, 1);

                if (state.selectedElement === wrapper) {
                    state.selectedElement = state.selectedElements.length > 0
                        ? state.selectedElements[state.selectedElements.length - 1]
                        : null;
                }
            } else {
                state.selectedElements.push(wrapper);
                wrapper.classList.add('selected');
                state.selectedElement = wrapper;
            }
        } else {
            deselectElement();
            state.selectedElements = [wrapper];
            state.selectedElement = wrapper;
            wrapper.classList.add('selected');
        }

        if (state.selectedElements.length === 0) {
            deselectElement();
            return;
        }

        updateSelectionOverlay();
        setupContextMenu(state.selectedElement);
        updatePropertiesForSelection();
    }

    function deselectElement() {
        if (state.activeContextMenu) state.activeContextMenu.destroy();
        if (state.selectionBox) state.selectionBox.remove();
        if (state.resizeHandles) {
            state.resizeHandles.forEach(h => h.remove());
            state.resizeHandles = null;
        }

        state.selectedElements.forEach(el => el.classList.remove('selected'));
        state.selectedElements = [];

        state.selectedElement = null;
        state.selectionBox = null;
        state.activeContextMenu = null;
        updatePropertiesForSelection();
        hideSnapLines();
        state.smartGuides.guides = { v: [], h: [] };
        state.smartGuides.baseAxes = null;
    }

    function createResizeHandles() {
        if (state.resizeHandles && state.resizeHandles.length > 0) return;

        const corners = [0, 1, 2, 3];
        state.resizeHandles = [];

        corners.forEach((_, i) => {
            const handle = document.createElementNS(SVG_NS, 'circle');
            handle.setAttribute('r', 6);
            handle.setAttribute('fill', '#fff');
            handle.setAttribute('stroke', 'var(--accent-primary)');
            handle.setAttribute('stroke-width', '1');
            handle.setAttribute('data-resize-handle', i.toString());
            handle.style.cursor = getCursorForDirection(['nw', 'ne', 'se', 'sw'][i]);
            handle.style.pointerEvents = 'all';
            handle.addEventListener('mousedown', (e) => startResizing(e, i), { passive: false });


            overlaySVG.appendChild(handle);
            state.resizeHandles.push(handle);
        });

        updateHandlesWorld(null, state.selectionBox ? {
            x: parseFloat(state.selectionBox.getAttribute('points').split(' ')[0].split(',')[0]),
            y: parseFloat(state.selectionBox.getAttribute('points').split(' ')[0].split(',')[1]),
            width: 0, height: 0
        } : null);
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
        if (state.selectionBox) state.selectionBox.remove();
        if (state.resizeHandles) {
            state.resizeHandles.forEach(h => h.remove());
            state.resizeHandles = null;
        }

        if (state.selectedElements.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        state.selectedElements.forEach(el => {
            const bbox = el.getBBox();
            if (!isFinite(bbox.x)) return;

            const corners = [
                localToOverlay(el, bbox.x, bbox.y),
                localToOverlay(el, bbox.x + bbox.width, bbox.y),
                localToOverlay(el, bbox.x + bbox.width, bbox.y + bbox.height),
                localToOverlay(el, bbox.x, bbox.y + bbox.height)
            ];
            corners.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
        });

        if (minX === Infinity) return;

        const width = maxX - minX;
        const height = maxY - minY;

        state.selectionBox = document.createElementNS(SVG_NS, 'polygon');
        state.selectionBox.setAttribute('fill', 'none');
        state.selectionBox.setAttribute('stroke', 'var(--accent-primary)');
        state.selectionBox.setAttribute('stroke-width', '1');
        state.selectionBox.setAttribute('stroke-dasharray', '4 2');
        state.selectionBox.style.pointerEvents = 'none';
        overlaySVG.appendChild(state.selectionBox);

        const pts = `${minX},${minY} ${maxX},${minY} ${maxX},${maxY} ${minX},${maxY}`;
        state.selectionBox.setAttribute('points', pts);

        createResizeHandles();
        updateHandlesWorld(null, { x: minX, y: minY, width: width, height: height });
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

    function updateHandlesWorld(wrapper, overrideRect = null) {
        if (!state.resizeHandles || !state.resizeHandles.length) return;

        let tl, tr, bl, br;

        if (overrideRect) {
            const { x, y, width, height } = overrideRect;
            tl = { x: x, y: y };
            tr = { x: x + width, y: y };
            bl = { x: x, y: y + height };
            br = { x: x + width, y: y + height };
        } else if (wrapper) {
            const bbox = wrapper.getBBox();
            tl = localToOverlay(wrapper, bbox.x, bbox.y);
            tr = localToOverlay(wrapper, bbox.x + bbox.width, bbox.y);
            bl = localToOverlay(wrapper, bbox.x, bbox.y + bbox.height);
            br = localToOverlay(wrapper, bbox.x + bbox.width, bbox.y + bbox.height);
        } else {
            return;
        }

        const coords = [tl, tr, bl, br];

        state.resizeHandles.forEach((handle, i) => {
            handle.setAttribute('cx', coords[i].x);
            handle.setAttribute('cy', coords[i].y);
            handle.removeAttribute('transform');
        });
    }

    function ensureWrapper(el) {
        if (el.tagName === 'g' && el.dataset.resizeWrapper === '1') return el;

        const existing = el.closest && el.closest('g[data-resize-wrapper="1"]');
        if (existing) return existing;

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

        if (state.selectedElements.length === 0) return;

        state.selectedElement = state.selectedElements.length === 1 ? state.selectedElements[0] : state.selectedElements[state.selectedElements.length - 1];

        state.isResizing = true;
        state.resizeHandleIndex = handleIndex;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.selectedElements.forEach(el => {
            const bbox = el.getBBox();
            if (!isFinite(bbox.x)) return;
            const corners = [
                localToOverlay(el, bbox.x, bbox.y),
                localToOverlay(el, bbox.x + bbox.width, bbox.y + bbox.height)
            ];
            corners.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
        });

        const startBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

        let anchorX, anchorY;
        switch (handleIndex) {
            case 0: anchorX = maxX; anchorY = maxY; break;
            case 1: anchorX = minX; anchorY = maxY; break;
            case 2: anchorX = maxX; anchorY = minY; break;
            case 3: anchorX = minX; anchorY = minY; break;
        }

        const overlayPt = overlaySVG.createSVGPoint();
        overlayPt.x = anchorX; overlayPt.y = anchorY;
        const screenPt = overlayPt.matrixTransform(overlaySVG.getScreenCTM());
        const editorAnchor = screenPt.matrixTransform(editorSVG.getScreenCTM().inverse());

        state.resizeContext = {
            startPoint: getSVGPoint(editorSVG, e.clientX, e.clientY),
            startW: startBox.width,
            startH: startBox.height,
            anchor: { x: editorAnchor.x, y: editorAnchor.y },
            items: state.selectedElements.map(el => ({
                element: el,
                base: getTransformComponents(el)
            }))
        };

        window.addEventListener('mousemove', onResizing);
        window.addEventListener('mouseup', stopResizing);
    }

    function onResizing(e) {
        if (!state.isResizing) return;

        const pt = getSVGPoint(editorSVG, e.clientX, e.clientY);
        const ctx = state.resizeContext;

        const mouseDx = pt.x - ctx.startPoint.x;
        const mouseDy = pt.y - ctx.startPoint.y;

        let diffX = mouseDx;
        let diffY = mouseDy;

        if (state.resizeHandleIndex === 0 || state.resizeHandleIndex === 2) diffX = -mouseDx;
        if (state.resizeHandleIndex === 0 || state.resizeHandleIndex === 1) diffY = -mouseDy;

        const finalW = Math.max(1, ctx.startW + diffX);
        const finalH = Math.max(1, ctx.startH + diffY);

        const scaleX = finalW / ctx.startW;
        const scaleY = finalH / ctx.startH;

        ctx.items.forEach(item => {
            const newTx = ctx.anchor.x + (item.base.tx - ctx.anchor.x) * scaleX;
            const newTy = ctx.anchor.y + (item.base.ty - ctx.anchor.y) * scaleY;

            const newSx = item.base.sx * scaleX;
            const newSy = item.base.sy * scaleY;

            setTransform(item.element, {
                tx: newTx,
                ty: newTy,
                sx: newSx,
                sy: newSy
            });
        });

        updateSelectionOverlay();
    }

    function stopResizing() {
        if (!state.isResizing) return;
        state.isResizing = false;
        state.resizeContext = null;
        state.resizeHandleIndex = null;

        window.removeEventListener('mousemove', onResizing);
        window.removeEventListener('mouseup', stopResizing);

        updateSelectionOverlay();
    }

    function setupSmartGuidesUI() {
        const toggle = document.getElementById('toggle-smart-guides');
        if (toggle) {
            toggle.checked = state.smartGuides.enabled;
            toggle.addEventListener('change', () => {
                state.smartGuides.enabled = !!toggle.checked;
                if (!state.smartGuides.enabled) hideSnapLines();
            });
        }
    }

    function ensureSnapLine(type) {
        if (type === 'v') {
            if (!state.smartGuides.vLine) {
                const l = document.createElementNS(SVG_NS, 'line');
                l.setAttribute('stroke', '#FF2DA4');
                l.setAttribute('stroke-width', '1');
                l.setAttribute('stroke-dasharray', '5 4');
                l.setAttribute('vector-effect', 'non-scaling-stroke');
                l.style.pointerEvents = 'none';
                overlaySVG.appendChild(l);
                state.smartGuides.vLine = l;
            }
            return state.smartGuides.vLine;
        } else {
            if (!state.smartGuides.hLine) {
                const l = document.createElementNS(SVG_NS, 'line');
                l.setAttribute('stroke', '#FF2DA4');
                l.setAttribute('stroke-width', '1');
                l.setAttribute('stroke-dasharray', '5 4');
                l.setAttribute('vector-effect', 'non-scaling-stroke');
                l.style.pointerEvents = 'none';
                overlaySVG.appendChild(l);
                state.smartGuides.hLine = l;
            }
            return state.smartGuides.hLine;
        }
    }

    function hideSnapLines() {
        if (state.smartGuides.vLine) state.smartGuides.vLine.style.display = 'none';
        if (state.smartGuides.hLine) state.smartGuides.hLine.style.display = 'none';
    }

    function showSnapLine(type, pos) {
        const vb = parseViewBox(overlaySVG);
        if (type === 'v') {
            const l = ensureSnapLine('v');
            l.setAttribute('x1', pos);
            l.setAttribute('x2', pos);
            l.setAttribute('y1', vb.y);
            l.setAttribute('y2', vb.y + vb.h);
            l.style.display = '';
        } else {
            const l = ensureSnapLine('h');
            l.setAttribute('y1', pos);
            l.setAttribute('y2', pos);
            l.setAttribute('x1', vb.x);
            l.setAttribute('x2', vb.x + vb.w);
            l.style.display = '';
        }
    }

    function computeOverlayAxesForElement(el) {
        try {
            const bbox = el.getBBox();
            if (!bbox || !isFinite(bbox.x) || !isFinite(bbox.y)) {
                return null;
            }
            const tl = localToOverlay(el, bbox.x, bbox.y);
            const br = localToOverlay(el, bbox.x + bbox.width, bbox.y + bbox.height);

            const left = Math.min(tl.x, br.x);
            const right = Math.max(tl.x, br.x);
            const top = Math.min(tl.y, br.y);
            const bottom = Math.max(tl.y, br.y);
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;

            return { left, right, top, bottom, cx, cy };
        } catch (_) {
            return null;
        }
    }

    function prepareSmartGuidesForDrag(draggedWrapper) {
        const guidesV = [];
        const guidesH = [];

        if (state.baseViewBox) {
            const centerX = state.baseViewBox.x + state.baseViewBox.w / 2;
            const centerY = state.baseViewBox.y + state.baseViewBox.h / 2;
            guidesV.push(centerX);
            guidesH.push(centerY);
        }

        const candidates = Array.from(editorSVG.querySelectorAll('g[data-resize-wrapper="1"], path, rect, circle, ellipse, line, text'));

        for (const node of candidates) {
            if (draggedWrapper && (node === draggedWrapper || draggedWrapper.contains(node))) continue;

            if (node.hasAttribute && node.hasAttribute('data-layer')) continue;
            if (node.tagName && node.tagName.toLowerCase() === 'defs') continue;

            if (node.tagName && node.tagName.toLowerCase() !== 'g') {
                const wr = node.closest('g[data-resize-wrapper="1"]');
                if (wr) continue;
            }

            const computedDisplay = getComputedStyle(node).display;
            if (computedDisplay === 'none') continue;

            const axes = computeOverlayAxesForElement(node);
            if (!axes) continue;

            guidesV.push(axes.left, axes.cx, axes.right);
            guidesH.push(axes.top, axes.cy, axes.bottom);
        }

        const dedup = (arr) => Array.from(new Set(arr.map(v => +(+v).toFixed(3))));
        state.smartGuides.guides.v = dedup(guidesV);
        state.smartGuides.guides.h = dedup(guidesH);

        const baseAxes = computeOverlayAxesForElement(draggedWrapper);
        state.smartGuides.baseAxes = baseAxes || null;
    }

    function applySmartSnapping(dx, dy, altPressed) {
        if (!state.smartGuides.enabled || altPressed || !state.smartGuides.baseAxes || !state.dragContext) {
            hideSnapLines();
            return { dx, dy };
        }

        const guidesV = state.smartGuides.guides.v || [];
        const guidesH = state.smartGuides.guides.h || [];

        const base = state.dragContext.base || { sx: 1, sy: 1 };
        const sx = Math.abs(base.sx || 1);
        const sy = Math.abs(base.sy || 1);

        const baseAxes = state.smartGuides.baseAxes;

        const predX = [
            baseAxes.left + dx * sx,
            baseAxes.cx + dx * sx,
            baseAxes.right + dx * sx
        ];
        const predY = [
            baseAxes.top + dy * sy,
            baseAxes.cy + dy * sy,
            baseAxes.bottom + dy * sy
        ];

        const m = overlaySVG.getScreenCTM();
        const scaleX = m ? Math.hypot(m.a, m.b) : 1;
        const scaleY = m ? Math.hypot(m.c, m.d) : 1;
        const thresholdPx = state.smartGuides.thresholdPx;
        const tolX = thresholdPx / (scaleX || 1);
        const tolY = thresholdPx / (scaleY || 1);

        let bestV = null;
        for (let i = 0; i < 3; i++) {
            const p = predX[i];
            for (let g = 0; g < guidesV.length; g++) {
                const target = guidesV[g];
                const d = Math.abs(target - p);
                if (d <= tolX) {
                    const distPx = d * (scaleX || 1);
                    if (!bestV || distPx < bestV.distPx) {
                        bestV = { target, i, distPx };
                    }
                }
            }
        }

        let bestH = null;
        for (let i = 0; i < 3; i++) {
            const p = predY[i];
            for (let g = 0; g < guidesH.length; g++) {
                const target = guidesH[g];
                const d = Math.abs(target - p);
                if (d <= tolY) {
                    const distPx = d * (scaleY || 1);
                    if (!bestH || distPx < bestH.distPx) {
                        bestH = { target, i, distPx };
                    }
                }
            }
        }

        let outDx = dx;
        let outDy = dy;

        if (bestV) {
            const baseAxis = [baseAxes.left, baseAxes.cx, baseAxes.right][bestV.i];
            outDx = (bestV.target - baseAxis) / (sx || 1);
            showSnapLine('v', bestV.target);
        } else {
            if (state.smartGuides.vLine) state.smartGuides.vLine.style.display = 'none';
        }

        if (bestH) {
            const baseAxis = [baseAxes.top, baseAxes.cy, baseAxes.bottom][bestH.i];
            outDy = (bestH.target - baseAxis) / (sy || 1);
            showSnapLine('h', bestH.target);
        } else {
            if (state.smartGuides.hLine) state.smartGuides.hLine.style.display = 'none';
        }

        return { dx: outDx, dy: outDy };
    }

    function setupContextMenu(element) {
        if (state.activeContextMenu) state.activeContextMenu.destroy();

        const menuItems = {};

        if (element) {
            menuItems['Copy'] = () => {
                copyElement(element);
            };
            menuItems['Cut'] = () => {
                cutElement(element);
            };
        }

        if (state.clipboard.element) {
            menuItems['Paste'] = () => {
                pasteElement();
            };
        }

        if (state.selectedElements.length > 0) {
            menuItems['Delete'] = () => {
                undoManager.recordState();
                state.selectedElements.forEach(el => el.remove());
                deselectElement();
                extractAndBuildPalette();
            };
        }

        if (element) {
            menuItems['Bring to front'] = () => {
                undoManager.recordState();
                const layer = state.layerManager.getLayerForElement(element);
                if (layer) {
                    layer.group.appendChild(element);
                    updateSelectionOverlay();
                }
            };
            menuItems['Send to back'] = () => {
                undoManager.recordState();
                const layer = state.layerManager.getLayerForElement(element);
                if (layer && layer.group.firstChild) {
                    layer.group.insertBefore(element, layer.group.firstChild);
                }
            };
        }

        if (Object.keys(menuItems).length > 0) {
            state.activeContextMenu = new ContextMenu(element || editorSVG, menuItems);
        }
    }

    function notifyClipboardState() {
        const hasContent = state.clipboard.element !== null;
        console.log('Clipboard state changed:', hasContent);
        ipcRenderer.send('clipboard-state-changed', hasContent);
    }

    function copyElement(element) {
        undoManager.recordState();

        try {
            const clonedElement = element.cloneNode(true);

            state.clipboard = {
                element: clonedElement,
                type: 'copy',
                offset: { x: 10, y: 10 }
            };

            console.log('Element copied to clipboard');
            notifyClipboardState();
        } catch (error) {
            console.error('Error copying element:', error);
        }
    }

    function cutElement(element) {
        undoManager.recordState();

        try {
            const clonedElement = element.cloneNode(true);

            state.clipboard = {
                element: clonedElement,
                type: 'cut',
                offset: { x: 10, y: 10 }
            };

            element.remove();
            deselectElement();
            extractAndBuildPalette();

            console.log('Element cut to clipboard');
            notifyClipboardState();
        } catch (error) {
            console.error('Error cutting element:', error);
        }
    }

    function pasteElement() {
        if (!state.clipboard.element) {
            console.log('Clipboard is empty');
            return;
        }

        undoManager.recordState();

        try {
            const pastedElement = state.clipboard.element.cloneNode(true);

            const existingWrappers = pastedElement.querySelectorAll ?
                pastedElement.querySelectorAll('g[data-resize-wrapper="1"]') : [];
            existingWrappers.forEach(wrapper => {
                const child = wrapper.firstElementChild;
                if (child) {
                    const wrapperTransform = wrapper.getAttribute('transform');
                    if (wrapperTransform) {
                        child.setAttribute('transform', wrapperTransform);
                    }
                    wrapper.parentNode.replaceChild(child, wrapper);
                }
            });

            let transform = { tx: state.clipboard.offset.x, ty: state.clipboard.offset.y, sx: 1, sy: 1 };

            const existingTransform = getTransformComponents(pastedElement);
            if (existingTransform.tx !== 0 || existingTransform.ty !== 0) {
                transform.tx += existingTransform.tx;
                transform.ty += existingTransform.ty;
            }

            setTransform(pastedElement, transform);

            editorSVG.appendChild(pastedElement);

            if (state.clipboard.type === 'cut') {
                state.clipboard.element = null;
                state.clipboard.type = null;
            } else {
                state.clipboard.offset.x += 10;
                state.clipboard.offset.y += 10;
            }

            const wrappedElement = ensureWrapper(pastedElement);
            selectElement(wrappedElement);
            extractAndBuildPalette();

            console.log('Element pasted successfully');

        } catch (error) {
            console.error('Error pasting element:', error);
        } finally {
            notifyClipboardState();
        }
    }

    notifyClipboardState();

    document.addEventListener('keydown', e => {
        const isCtrl = e.ctrlKey || e.metaKey;

        if (e.code === 'Space' && !state.isSpacePressed) {
            state.isSpacePressed = true;
            updateCursorStyle();

            if (canvasContainer.contains(document.activeElement) ||
                document.activeElement === canvasContainer) {
                e.preventDefault();
            }
            return;
        }

        if (isCtrl && !e.shiftKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                applyZoom(Math.min(10, state.zoom * 1.125));
                return;
            }
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                applyZoom(Math.max(0.1, state.zoom / 1.125));
                return;
            }
        }

        if (isCtrl) {
            if (e.key === 'c' && state.selectedElements.length > 0) {
                e.preventDefault();
                copyElement(state.selectedElements[0]);
                return;
            }
            if (e.key === 'x' && state.selectedElements.length > 0) {
                e.preventDefault();
                cutElement(state.selectedElements[0]);
                return;
            }
            if (e.key === 'v') {
                e.preventDefault();
                pasteElement();
                return;
            }
        }

        if (state.isSpacePressed) return;

        if (e.key === 'Delete' && state.selectedElements.length > 0) {
            undoManager.recordState();
            state.selectedElements.forEach(el => el.remove());
            deselectElement();
            extractAndBuildPalette();
        }

        if (e.key === 'Escape' && state.currentTool === 'path' && state.pathStep > 0) {
            if (state.currentPath) {
                state.currentPath.remove();
            }
            resetPathState();
        }

        if (isCtrl || e.altKey || e.shiftKey) return;

        const toolButtons = document.querySelectorAll('.tool-button');

        switch (e.key.toLowerCase()) {
            case 'v':
                toolButtons[0].click();
                break;
            case 'r':
                toolButtons[1].click();
                break;
            case 'e':
                toolButtons[2].click();
                break;
            case 'l':
                toolButtons[3].click();
                break;
            case 'p':
                toolButtons[4].click();
                break;
        }
    });

    function setupCanvasListeners() {
        canvasContainer.addEventListener('mousedown', onMouseDown);
        canvasContainer.addEventListener('mousemove', onMouseMove);
        canvasContainer.addEventListener('mouseup', onMouseUp);
        canvasContainer.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            if (e.target === canvasContainer || e.target === editorSVG) {
                if (state.currentTool === 'select' && !(e.ctrlKey || e.metaKey)) {
                    deselectElement();
                }
            }
        });

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        canvasContainer.addEventListener('mouseenter', updateCursorStyle);
        canvasContainer.addEventListener('mousemove', updateCursorStyle);
        canvasContainer.addEventListener('mouseleave', resetCursorStyle);
    }

    function handleKeyDown(e) {
        if (e.code === 'Space' && !state.isSpacePressed) {
            state.isSpacePressed = true;
            updateCursorStyle();

            if (canvasContainer.contains(e.target) || e.target === canvasContainer) {
                e.preventDefault();
            }
        }
    }

    function handleKeyUp(e) {
        if (e.code === 'Space' && state.isSpacePressed) {
            state.isSpacePressed = false;
            if (!state.isPanning) {
                updateCursorStyle();
            }
        }
    }

    function updateCursorStyle() {
        if (state.isPanning) {
            canvasContainer.style.cursor = 'grabbing';
        } else if (state.isSpacePressed && isMouseOverCanvas()) {
            canvasContainer.style.cursor = 'grab';
        } else {
            resetCursorStyle();
        }
    }

    function resetCursorStyle() {
        if (state.isPanning || (state.isSpacePressed && isMouseOverCanvas())) {
            return;
        }

        switch (state.currentTool) {
            case 'select':
                canvasContainer.style.cursor = 'default';
                break;
            case 'rect':
            case 'ellipse':
            case 'line':
            case 'path':
                canvasContainer.style.cursor = 'crosshair';
                break;
            default:
                canvasContainer.style.cursor = 'default';
        }
    }

    function isMouseOverCanvas() {
        return true;
    }

    function onMouseDown(e) {
        if (e.button !== 0) return;

        const handleEl = e.target.closest && e.target.closest('circle[data-resize-handle]');
        if (handleEl) return;

        const pt = getSVGPoint(editorSVG, e.clientX, e.clientY);
        state.startPoint = pt;

        if (state.isSpacePressed && !state.isDrawing && !state.isDragging) {
            startPanning(e);
            return;
        }

        if (state.currentTool === 'select') {
            const rawTarget = e.target.closest ? e.target.closest('path, rect, circle, ellipse, line, text, g') : null;

            if (rawTarget && editorSVG.contains(rawTarget)) {
                undoManager.recordState();
                const wrapper = rawTarget.closest && rawTarget.closest('g[data-resize-wrapper="1"]');
                const target = wrapper || rawTarget;

                const isCtrl = e.ctrlKey || e.metaKey;
                const isAlreadySelected = state.selectedElements.includes(target);

                if (isCtrl) {
                    selectElement(target, true);
                } else {
                    if (!isAlreadySelected) {
                        selectElement(target, false);
                    }
                }

                state.isDragging = true;
                state.dragContext = {
                    startPoint: state.startPoint,
                    items: state.selectedElements.map(el => ({
                        element: el,
                        base: getTransformComponents(el)
                    })),
                    base: getTransformComponents(state.selectedElements[state.selectedElements.length - 1])
                };

                prepareSmartGuidesForDrag(target);
                hideSnapLines();
            } else {
                if (!e.ctrlKey && !e.metaKey) {
                    deselectElement();
                }
            }
            return;
        }

        if (state.currentTool === 'path') {
            handlePathClick(pt);
            return;
        }

        state.isDrawing = true;
        const toolActions = {
            rect: startDrawingRect,
            ellipse: startDrawingEllipse,
            line: startDrawingLine,
        };
        toolActions[state.currentTool]?.(pt);
    }

    function handlePathClick(pt) {
        if (state.pathStep === 0) {
            createCurvePath();
            state.curvePoints.p1 = pt;
            state.pathStep = 1;

            const marker = document.createElementNS(SVG_NS, 'circle');
            marker.setAttribute('cx', pt.x);
            marker.setAttribute('cy', pt.y);
            marker.setAttribute('r', 3);
            marker.setAttribute('fill', 'red');
            marker.setAttribute('class', 'temp-marker');
            overlaySVG.appendChild(marker);

        } else if (state.pathStep === 1) {
            state.curvePoints.p2 = pt;
            state.pathStep = 2;

            const marker = document.createElementNS(SVG_NS, 'circle');
            marker.setAttribute('cx', pt.x);
            marker.setAttribute('cy', pt.y);
            marker.setAttribute('r', 3);
            marker.setAttribute('fill', 'blue');
            marker.setAttribute('class', 'temp-marker');
            overlaySVG.appendChild(marker);

            updateCurvePath(pt);

        } else if (state.pathStep === 2) {
            finalizeCurve();
        }
    }

    function onMouseMove(e) {
        const pt = getSVGPoint(editorSVG, e.clientX, e.clientY);

        if (state.isPanning) {
            handlePanning(e);
            return;
        }

        updateCursorStyle();

        if (state.isDragging && state.dragContext && state.dragContext.items) {
            const dx = pt.x - state.dragContext.startPoint.x;
            const dy = pt.y - state.dragContext.startPoint.y;

            const snap = applySmartSnapping(dx, dy, e.altKey);

            state.dragContext.items.forEach(item => {
                setTransform(item.element, {
                    tx: item.base.tx + snap.dx,
                    ty: item.base.ty + snap.dy,
                    sx: item.base.sx,
                    sy: item.base.sy,
                });
            });

            updateSelectionOverlay();
        }

        if (state.currentTool === 'path' && state.pathStep === 2) {
            updateCurvePath(pt);
        }

        if (!state.isDrawing || state.currentTool === 'path') return;

        const toolActions = {
            rect: updateDrawing,
            ellipse: updateDrawing,
            line: updateDrawing,
        };
        toolActions[state.currentTool]?.(pt);
    }

    function onMouseUp(e) {
        if (state.isPanning) {
            stopPanning();
        }

        if (state.isDragging) {
            state.isDragging = false;
            state.smartGuides.guides = { v: [], h: [] };
            state.smartGuides.baseAxes = null;
            hideSnapLines();
        }

        if (state.isDrawing && state.currentTool !== 'path') {
            state.isDrawing = false;
            finalizeElement();
        }

        updateCursorStyle();
    }

    function startPanning(e) {
        state.isPanning = true;
        state.panContext = {
            startViewBox: parseViewBox(editorSVG),
            startMouse: { x: e.clientX, y: e.clientY }
        };

        canvasContainer.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function handlePanning(e) {
        if (!state.isPanning || !state.panContext.startViewBox) return;

        const { startViewBox, startMouse } = state.panContext;
        const dx = (startMouse.x - e.clientX) * (startViewBox.w / canvasContainer.clientWidth);
        const dy = (startMouse.y - e.clientY) * (startViewBox.h / canvasContainer.clientHeight);

        const newX = startViewBox.x + dx;
        const newY = startViewBox.y + dy;

        editorSVG.setAttribute('viewBox', `${newX} ${newY} ${startViewBox.w} ${startViewBox.h}`);
        if (overlaySVG) {
            overlaySVG.setAttribute('viewBox', `${newX} ${newY} ${startViewBox.w} ${startViewBox.h}`);
        }

        updateSelectionOverlay();
    }

    function stopPanning() {
        state.isPanning = false;
        state.panContext = {
            startViewBox: null,
            startMouse: null
        };

        if (state.isSpacePressed) {
            canvasContainer.style.cursor = 'grab';
        } else {
            resetCursorStyle();
        }
    }

    function finalizeElement() {
        if (!state.currentPath) return;

        undoManager.recordState();

        if (state.currentTool !== 'select') {
            selectElement(state.currentPath);
        }
        setupContextMenu(state.currentPath);
        extractAndBuildPalette();

        state.currentPath = null;
    }

    function createCurvePath() {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', propStroke.value);
        path.setAttribute('stroke-width', propStrokeWidth.value);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        editorSVG.appendChild(path);
        state.currentPath = path;
    }

    function updateCurvePath(currentPt) {
        if (!state.currentPath || !state.curvePoints.p1 || !state.curvePoints.p2) return;

        const { p1, p2 } = state.curvePoints;

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const dirX = currentPt.x - midX;
        const dirY = currentPt.y - midY;

        const controlX = midX - dirX;
        const controlY = midY - dirY;

        const d = `M ${p1.x} ${p1.y} Q ${controlX} ${controlY} ${p2.x} ${p2.y}`;
        state.currentPath.setAttribute('d', d);
    }

    function finalizeCurve() {
        if (!state.currentPath) return;

        undoManager.recordState();

        const markers = overlaySVG.querySelectorAll('.temp-marker');
        markers.forEach(marker => marker.remove());

        selectElement(state.currentPath);
        setupContextMenu(state.currentPath);
        extractAndBuildPalette();

        resetPathState();
    }

    function createShape(type) {
        const shape = document.createElementNS(SVG_NS, type);

        shape.setAttribute('fill', type === 'path' ? 'none' : propFill.value);
        shape.setAttribute('stroke', propStroke.value);
        shape.setAttribute('stroke-width', propStrokeWidth.value);

        if (type === 'path') {
            shape.setAttribute('stroke-linecap', 'round');
            shape.setAttribute('stroke-linejoin', 'round');
        }

        state.layerManager.addElementToActiveLayer(shape);

        state.currentPath = shape;
        return shape;
    }

    function startDrawingRect(pt) {
        const shape = createShape('rect');
        shape.setAttribute('x', pt.x);
        shape.setAttribute('y', pt.y);
        shape.setAttribute('width', 0);
        shape.setAttribute('height', 0);
    }

    function startDrawingEllipse(pt) {
        const shape = createShape('ellipse');
        shape.setAttribute('cx', pt.x);
        shape.setAttribute('cy', pt.y);
        shape.setAttribute('rx', 0);
        shape.setAttribute('ry', 0);
    }

    function startDrawingLine(pt) {
        const shape = createShape('line');
        shape.setAttribute('x1', pt.x);
        shape.setAttribute('y1', pt.y);
        shape.setAttribute('x2', pt.x);
        shape.setAttribute('y2', pt.y);
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

    function serializeEditorSVG() {
        try {
            const clone = editorSVG.cloneNode(true);

            if (state.baseViewBox) {
                const { x, y, w, h } = state.baseViewBox;
                clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
            }
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
        if (state.selectedElements.length > 0) {
            undoManager.recordState();
            state.selectedElements.forEach(el => el.remove());
            deselectElement();
            extractAndBuildPalette();
        }
    });
    ipcRenderer.on('menu-copy', () => {
        if (state.selectedElements.length > 0) {
            copyElement(state.selectedElements[0]);
        }
    });
    ipcRenderer.on('menu-cut', () => {
        if (state.selectedElements.length > 0) {
            cutElement(state.selectedElements[0]);
        }
    });
    ipcRenderer.on('menu-paste', () => {
        pasteElement();
    });
    ipcRenderer.on('menu-bring-to-front', () => {
        if (state.selectedElement) {
            undoManager.recordState();
            const layer = state.layerManager.getLayerForElement(state.selectedElement);
            if (layer) {
                layer.group.appendChild(state.selectedElement);
                updateSelectionOverlay();
            }
        }
    });
    ipcRenderer.on('menu-send-to-back', () => {
        if (state.selectedElement) {
            undoManager.recordState();
            const layer = state.layerManager.getLayerForElement(state.selectedElement);
            if (layer && layer.group.firstChild) {
                layer.group.insertBefore(state.selectedElement, layer.group.firstChild);
                updateSelectionOverlay();
            }
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