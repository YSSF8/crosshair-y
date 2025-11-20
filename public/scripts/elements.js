class CustomToggle extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this._button = document.createElement('button');
        this._button.setAttribute('role', 'checkbox');
        this._button.setAttribute('aria-checked', 'false');

        const style = document.createElement('style');
        style.textContent = `
            button {
                position: relative;
                width: 100px;
                height: 40px;
                border: none;
                border-radius: 20px;
                background: var(--primary-opposite);
                color: #5a5a5a;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            button[aria-checked="true"] {
                background: var(--accent-primary);
                color: white;
                box-shadow: 0 3px 6px rgba(0,87,183,0.2);
            }

            button span {
                position: relative;
                z-index: 1;
                transition: opacity 0.2s ease;
            }
        `;

        this._span = document.createElement('span');
        this._span.textContent = 'Off';
        this._button.appendChild(this._span);

        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(this._button);

        this._button.addEventListener('click', (e) => this.toggle());
    }

    get checked() {
        return this.hasAttribute('checked');
    }

    set checked(value) {
        const isChecked = Boolean(value);
        if (isChecked) {
            this.setAttribute('checked', '');
        } else {
            this.removeAttribute('checked');
        }
        this._updateButton();
    }

    toggle() {
        this.checked = !this.checked;
        this._dispatchChangeEvent();
    }

    check() {
        this.checked = true;
        this._dispatchChangeEvent();
    }

    uncheck() {
        this.checked = false;
        this._dispatchChangeEvent();
    }

    _updateButton() {
        const isChecked = this.checked;
        this._button.setAttribute('aria-checked', isChecked.toString());
        this._span.textContent = isChecked ? 'On' : 'Off';
    }

    _dispatchChangeEvent() {
        const event = new Event('change', { bubbles: true });
        this.dispatchEvent(event);
    }

    static get observedAttributes() {
        return ['checked'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'checked') {
            this._updateButton();
        }
    }
}

customElements.define('custom-toggle', CustomToggle);

class CustomRange extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this._container = document.createElement('div');
        this._container.className = 'slider';

        this._track = document.createElement('div');
        this._track.className = 'track';

        this._thumb = document.createElement('div');
        this._thumb.className = 'thumb';
        this._thumb.setAttribute('tabindex', '0');
        this._thumb.setAttribute('role', 'slider');

        this._input = document.createElement('input');
        this._input.type = 'range';
        this._input.hidden = true;

        const style = document.createElement('style');
        style.textContent = `
            .slider {
                position: relative;
                width: 200px;
                height: 24px;
                touch-action: none;
            }
            
            .track {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: 100%;
                height: 4px;
                background: var(--primary-opposite);
                border-radius: 2px;
                overflow: hidden;
            }
            
            .track::before {
                content: '';
                position: absolute;
                width: var(--width, 0%);
                height: 100%;
                background: var(--accent-primary);
                transition: width 0.1s linear;
            }
            
            .thumb {
                position: absolute;
                top: 50%;
                left: 0;
                width: 16px;
                height: 16px;
                background: #ffffff;
                border: 2px solid var(--accent-primary);
                border-radius: 50%;
                transform: translate(-50%, -50%);
                cursor: pointer;
                transition: left 0.1s linear;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .thumb:focus {
                outline: none;
                box-shadow: 0 0 0 3px rgba(0,87,183,0.2);
            }
        `;

        this._container.appendChild(this._track);
        this._container.appendChild(this._thumb);
        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(this._container);
        this.shadowRoot.appendChild(this._input);

        this._min = parseFloat(this.getAttribute('min')) || 0;
        this._max = parseFloat(this.getAttribute('max')) || 100;
        this._step = parseFloat(this.getAttribute('step')) || 1;
        this._value = parseFloat(this.getAttribute('value')) || this._min;

        this._isDragging = false;
        this._rafId = null;

        this._setupEventListeners();
        this._updateUI();
    }

    get value() {
        return this._value;
    }

    set value(newValue) {
        this._value = Math.min(Math.max(newValue, this._min), this._max);
        this._input.value = this._value;
        this._updateUI();
        this._dispatchChangeEvent();
    }

    get min() { return this._min; }
    get max() { return this._max; }
    get step() { return this._step; }

    set min(value) {
        this._min = parseFloat(value);
        this._updateUI();
    }

    set max(value) {
        this._max = parseFloat(value);
        this._updateUI();
    }

    set step(value) {
        this._step = parseFloat(value);
    }

    _updateUI() {
        const percent = (this._value - this._min) / (this._max - this._min) * 100;
        this._track.style.setProperty('--width', `${percent}%`);
        this._thumb.style.left = `${percent}%`;
        this._input.value = this._value;
        this._thumb.setAttribute('aria-valuenow', this._value);
    }

    _handleStart = (e) => {
        this._isDragging = true;
        this._container.classList.add('dragging');
        this._thumb.focus();

        if (this._rafId) cancelAnimationFrame(this._rafId);

        this._updateValueFromEvent(e);

        this._thumb.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', this._handleMove);
        document.addEventListener('pointerup', this._handleEnd);
    }

    _handleMove = (e) => {
        if (!this._isDragging) return;
        this._rafId = requestAnimationFrame(() => {
            this._updateValueFromEvent(e);
        });
    }

    _handleEnd = () => {
        this._isDragging = false;
        this._container.classList.remove('dragging');
        document.removeEventListener('pointermove', this._handleMove);
        document.removeEventListener('pointerup', this._handleEnd);
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }

    _updateValueFromEvent(e) {
        const rect = this._container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const rawValue = this._min + x * (this._max - this._min);
        this.value = Math.round(rawValue / this._step) * this._step;
    }

    _dispatchChangeEvent() {
        const event = new Event('change', { bubbles: true });
        this.dispatchEvent(event);
    }

    _setupEventListeners() {
        this._thumb.addEventListener('pointerdown', this._handleStart);
        this._container.addEventListener('pointerdown', this._handleStart);

        this._thumb.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? this._step * 10 : this._step;
            switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowDown':
                    this.value -= step;
                    break;
                case 'ArrowRight':
                case 'ArrowUp':
                    this.value += step;
                    break;
                case 'Home':
                    this.value = this._min;
                    break;
                case 'End':
                    this.value = this._max;
                    break;
            }
        });
    }

    static get observedAttributes() {
        return ['min', 'max', 'step', 'value'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        switch (name) {
            case 'min':
                this.min = newValue;
                break;
            case 'max':
                this.max = newValue;
                break;
            case 'step':
                this.step = newValue;
                break;
            case 'value':
                this.value = parseFloat(newValue);
                break;
        }
    }
}

customElements.define('custom-range', CustomRange);

class CustomCheck extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._id = this.getAttribute('id') || `check-${Math.random().toString(36).substr(2, 9)}`;

        this._button = document.createElement('button');
        this._button.setAttribute('role', 'checkbox');
        this._button.setAttribute('aria-checked', 'false');
        this._button.setAttribute('id', this._id);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.innerHTML = `
            <path d="M8.5 12.5L11 15L16 9" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="checkmark"/>
        `;

        const style = document.createElement('style');
        style.textContent = `
            button {
                position: relative;
                width: 20px;
                height: 20px;
                border: none;
                border-radius: 5px;
                background: var(--primary-opposite);
                color: #5a5a5a;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            button[aria-checked="true"] {
                background: var(--accent-primary);
                color: white;
                box-shadow: 0 3px 6px rgba(0,87,183,0.2);
            }

            svg {
                width: 20px;
                height: 20px;
                opacity: 0;
                transform: scale(4) translateZ(0);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            button[aria-checked="true"] svg {
                opacity: 1;
                transform: scale(2) translateZ(0);
            }

            .checkmark {
                stroke-dasharray: 24;
                stroke-dashoffset: 24;
                transition: stroke-dashoffset 0.35s ease-out;
            }

            button[aria-checked="true"] .checkmark {
                stroke-dashoffset: 0;
                transition-delay: 0.1s;
            }
        `;

        this._button.appendChild(svg);
        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(this._button);

        this._handleLabelClicks = this._handleLabelClicks.bind(this);
        setTimeout(() => this._connectLabel(), 0);
    }

    _connectLabel() {
        const parent = this.parentElement;
        if (parent) {
            parent.removeEventListener('click', this._handleLabelClicks);
            parent.addEventListener('click', this._handleLabelClicks);
        }
    }

    _handleLabelClicks(e) {
        if (e.target.tagName === 'LABEL' || e.target.tagName === 'SPAN') {
            if (e.target.htmlFor === this._id ||
                e.target.closest(`label[for="${this._id}"]`)) {
                this.toggle();
            }
        }
    }

    get checked() {
        return this.hasAttribute('checked');
    }

    set checked(value) {
        const isChecked = Boolean(value);
        if (isChecked) {
            this.setAttribute('checked', '');
        } else {
            this.removeAttribute('checked');
        }
        this._updateButton();
    }

    toggle() {
        this.checked = !this.checked;
        this._dispatchChangeEvent();
    }

    check() {
        this.checked = true;
        this._dispatchChangeEvent();
    }

    uncheck() {
        this.checked = false;
        this._dispatchChangeEvent();
    }

    _updateButton() {
        const isChecked = this.checked;
        this._button.setAttribute('aria-checked', isChecked.toString());
    }

    _dispatchChangeEvent() {
        const event = new Event('change', { bubbles: true });
        this.dispatchEvent(event);
    }

    disconnectedCallback() {
        const parent = this.parentElement;
        if (parent) {
            parent.removeEventListener('click', this._handleLabelClicks);
        }
    }

    static get observedAttributes() {
        return ['checked', 'id'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'checked') {
            this._updateButton();
        }
        if (name === 'id') {
            this._id = newValue;
            this._button.setAttribute('id', newValue);
        }
    }
}

customElements.define('custom-check', CustomCheck);

class CustomSelect extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            :host {
                --radius: 8px;
                --bg: var(--primary-color, #181818);
                --border: 1px solid #ccc;
                --accent: var(--accent-primary, #0057b7);
                --shadow: 0 4px 12px rgba(0,0,0,.15);
                display: inline-block;
                position: relative;
                font-family: inherit;
                font-size: 14px;
                min-width: 160px;
            }

            .trigger {
                width: 100%;
                padding: 10px 12px;
                border: var(--border);
                border-radius: var(--radius);
                background: var(--bg);
                color: var(--text);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .trigger:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 2px;
            }

            .label {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .chevron {
                width: 12px;
                height: 12px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                transition: transform .25s;
                flex-shrink: 0;
            }
            :host([open]) .chevron {
                transform: rotate(180deg);
            }

            .dropdown {
                position: fixed;
                top: 0;
                left: 0;
                min-width: var(--dropdown-width, 160px);
                background: var(--bg);
                border: var(--border);
                border-radius: var(--radius);
                box-shadow: var(--shadow);
                z-index: 9999;
                max-height: 200px;
                overflow-y: auto;
                opacity: 0;
                transform: translateY(-6px);
                pointer-events: none;
                transition: opacity .25s ease, transform .25s ease;
            }
            :host([open]) .dropdown {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }

            .option {
                padding: 8px 12px;
                cursor: pointer;
                user-select: none;
            }
            .option[selected] {
                background: var(--accent);
                color: #fff;
            }
            .option:hover:not([selected]) {
                background: rgba(0,0,0,.05);
            }

            ::-webkit-scrollbar {
                width: var(--default-px);
                height: var(--default-px);
            }
            ::-webkit-scrollbar-thumb {
                background-color: var(--scroll-bar-normal);
                border-radius: var(--default-px);
            }
            ::-webkit-scrollbar-thumb:hover {
                background-color: var(--scroll-bar-hover);
            }
            ::-webkit-scrollbar-thumb:active {
                background-color: var(--scroll-bar-active);
            }
        `;

        this._trigger = document.createElement('button');
        this._trigger.className = 'trigger';
        this._trigger.setAttribute('type', 'button');
        this._trigger.setAttribute('aria-haspopup', 'listbox');
        this._trigger.setAttribute('aria-expanded', 'false');

        this._label = document.createElement('span');
        this._label.className = 'label';

        this._chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._chevron.classList.add('chevron');
        this._chevron.setAttribute('viewBox', '0 0 24 24');
        this._chevron.innerHTML = '<polyline points="6,9 12,15 18,9" />';

        this._trigger.append(this._label, this._chevron);

        this._dropdown = document.createElement('div');
        this._dropdown.className = 'dropdown';
        this._dropdown.setAttribute('role', 'listbox');

        this.shadowRoot.append(style, this._trigger, this._dropdown);

        this._options = [];
        this._value = '';
        this._open = false;

        this._observer = null;
        this._boundReposition = () => this._reposition();

        this._trigger.addEventListener('click', () => this.toggle());
        this._dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.option');
            if (option) {
                this._select(option.dataset.value);
                this.open = false;
            }
        });
        this.addEventListener('keydown', this._onKeyDown.bind(this));
    }

    get value() {
        return this._value;
    }
    set value(v) {
        this._select(v, { silent: true });
    }

    get open() {
        return this._open;
    }
    set open(flag) {
        flag ? this._show() : this._hide();
    }

    toggle() {
        this.open = !this.open;
    }

    _parseOptions() {
        this._options = [...this.children].filter(n => n.tagName === 'OPTION');

        const selectedOption =
            this._options.find(o => o.hasAttribute('selected')) ||
            this._options[0] ||
            null;

        this._value = selectedOption ? selectedOption.value : '';

        this._dropdown.innerHTML = '';
        this._options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'option';
            div.textContent = opt.textContent;
            div.dataset.value = opt.value;
            if (opt.value === this._value) div.setAttribute('selected', '');
            this._dropdown.appendChild(div);
        });
        this._updateLabel();
    }

    _updateLabel() {
        const selected = this._options.find(o => o.value === this._value);
        this._label.textContent = selected ? selected.textContent : '';
    }

    _select(value, { silent = false } = {}) {
        if (value === this._value) return;
        this._value = value;
        this._updateLabel();
        this._dropdown.querySelectorAll('.option').forEach(opt => {
            opt.toggleAttribute('selected', opt.dataset.value === value);
        });
        if (!silent) {
            this.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    _show() {
        if (this._open) return;
        this._open = true;
        this.setAttribute('open', '');
        this._trigger.setAttribute('aria-expanded', 'true');

        this.style.setProperty('--dropdown-width', `${this.offsetWidth}px`);
        this._reposition();

        this._observer = new IntersectionObserver(this._boundReposition, {
            root: null,
            threshold: 1
        });
        this._observer.observe(this);
        window.addEventListener('scroll', this._boundReposition, true);
        window.addEventListener('resize', this._boundReposition);
        document.addEventListener('click', this._onOutsideClick.bind(this), true);
    }

    _hide() {
        if (!this._open) return;
        this._open = false;
        this.removeAttribute('open');
        this._trigger.setAttribute('aria-expanded', 'false');

        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        window.removeEventListener('scroll', this._boundReposition, true);
        window.removeEventListener('resize', this._boundReposition);
        document.removeEventListener('click', this._onOutsideClick, true);
    }

    _reposition() {
        if (!this._open) return;

        const triggerRect = this.getBoundingClientRect();
        const dropdownHeight = this._dropdown.offsetHeight || 200;
        const gap = 4;

        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        const fitsBelow = spaceBelow >= dropdownHeight + gap;
        const fitsAbove = spaceAbove >= dropdownHeight + gap;

        let top, direction;
        if (fitsBelow) {
            top = triggerRect.bottom + window.scrollY + gap;
            direction = 1;
        } else if (fitsAbove) {
            top = triggerRect.top + window.scrollY - dropdownHeight - gap;
            direction = -1;
        } else {
            top = triggerRect.bottom + window.scrollY + gap;
            direction = 1;
        }

        this._dropdown.style.top = `${top}px`;
        this._dropdown.style.left = `${triggerRect.left + window.scrollX}px`;

        this.style.setProperty('--dropdown-direction', direction);
    }

    _onOutsideClick(e) {
        if (!e.composedPath().includes(this)) this._hide();
    }

    _onKeyDown(e) {
        if (!this._open && ['ArrowDown', 'ArrowUp', ' '].includes(e.key)) {
            e.preventDefault();
            this.open = true;
            return;
        }
        if (!this._open) return;

        const opts = [...this._dropdown.querySelectorAll('.option')];
        const currentIndex = opts.findIndex(o => o.hasAttribute('selected'));
        let nextIndex = currentIndex;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = (currentIndex + 1) % opts.length;
                break;
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = (currentIndex - 1 + opts.length) % opts.length;
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                this._select(opts[currentIndex].dataset.value);
                this.open = false;
                break;
            case 'Escape':
                e.preventDefault();
                this.open = false;
                break;
        }
        if (nextIndex !== currentIndex) {
            opts.forEach(o => o.removeAttribute('selected'));
            opts[nextIndex].setAttribute('selected', '');
        }
    }

    static get observedAttributes() {
        return ['value'];
    }

    attributeChangedCallback(name, old, val) {
        if (name === 'value' && val !== this._value) {
            this._select(val, { silent: true });
        }
    }

    connectedCallback() {
        this._parseOptions();
        this._upgradeProperty('value');
        this._upgradeProperty('open');
    }

    _upgradeProperty(prop) {
        if (this.hasOwnProperty(prop)) {
            const value = this[prop];
            delete this[prop];
            this[prop] = value;
        }
    }

    disconnectedCallback() {
        this._hide();
    }
}

customElements.define('custom-select', CustomSelect);

class MultiButtons extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            :host {
                --radius: 8px;
                --bg: var(--primary-color, #181818);
                --border: 1px solid #ccc;
                --accent: var(--accent-primary, #0057b7);
                --shadow: 0 4px 12px rgba(0,0,0,.15);
                display: inline-block;
                position: relative;
                font-family: inherit;
                font-size: 14px;
            }

            .trigger {
                padding: 10px 16px;
                border: var(--border);
                border-radius: var(--radius);
                background: var(--bg);
                color: var(--text);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                user-select: none;
            }
            .trigger:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: 2px;
            }

            .chevron {
                width: 12px;
                height: 12px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                transition: transform .25s;
            }
            :host([open]) .chevron {
                transform: rotate(180deg);
            }

            .dropdown {
                position: fixed;
                top: 0;
                left: 0;
                min-width: var(--dropdown-width, 160px);
                background: var(--bg);
                border: var(--border);
                border-radius: var(--radius);
                box-shadow: var(--shadow);
                z-index: 9999;
                opacity: 0;
                transform: translateY(-6px);
                overflow: hidden;
                pointer-events: none;
                transition: opacity .25s ease, transform .25s ease;
            }
            :host([open]) .dropdown {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }

            .option {
                all: unset;
                display: block;
                padding: 8px 12px;
                cursor: pointer;
                white-space: nowrap;
                box-sizing: border-box;
                width: 100%;
                color: var(--text);
            }
            .option:hover {
                background: var(--accent);
            }
        `;

        this._trigger = document.createElement('button');
        this._trigger.className = 'trigger';
        this._trigger.type = 'button';
        this._trigger.setAttribute('aria-haspopup', 'menu');
        this._trigger.setAttribute('aria-expanded', 'false');

        this._label = document.createElement('span');
        this._label.textContent = this.getAttribute('value') || '';

        this._chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._chevron.classList.add('chevron');
        this._chevron.setAttribute('viewBox', '0 0 24 24');
        this._chevron.innerHTML = '<polyline points="6,9 12,15 18,9"/>';

        this._trigger.append(this._label, this._chevron);

        this._dropdown = document.createElement('div');
        this._dropdown.className = 'dropdown';
        this._dropdown.setAttribute('role', 'menu');

        this.shadowRoot.append(style, this._trigger, this._dropdown);

        this._open = false;
        this._boundReposition = () => this._reposition();
        this._boundOutsideClick = (e) => this._onOutsideClick(e);

        this._trigger.addEventListener('click', () => this.toggle());
        this.addEventListener('keydown', this._onKeyDown.bind(this));
    }

    get open() { return this._open; }
    set open(flag) { flag ? this._show() : this._hide(); }
    toggle() { this.open = !this.open; }

    _parseOptions() {
        this._dropdown.innerHTML = '';
        [...this.children]
            .filter(n => n.tagName === 'OPTION')
            .forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'option';
                btn.type = 'button';
                btn.dataset.value = opt.value;
                btn.textContent = opt.textContent;
                btn.setAttribute('role', 'menuitem');
                btn.addEventListener('click', () => this._invoke(opt.value, opt.textContent));
                this._dropdown.appendChild(btn);
            });
    }

    _invoke(value, label) {
        this.dispatchEvent(
            new CustomEvent('action', {
                detail: { value, label },
                bubbles: true,
            })
        );
        this.open = false;
    }

    _show() {
        if (this._open) return;
        this._open = true;
        this.setAttribute('open', '');
        this._trigger.setAttribute('aria-expanded', 'true');
        this.style.setProperty('--dropdown-width', `${this.offsetWidth}px`);
        this._reposition();
        window.addEventListener('scroll', this._boundReposition, true);
        window.addEventListener('resize', this._boundReposition);
        document.addEventListener('click', this._boundOutsideClick, true);
    }

    _hide() {
        if (!this._open) return;
        this._open = false;
        this.removeAttribute('open');
        this._trigger.setAttribute('aria-expanded', 'false');
        window.removeEventListener('scroll', this._boundReposition, true);
        window.removeEventListener('resize', this._boundReposition);
        document.removeEventListener('click', this._boundOutsideClick, true);
    }

    _reposition() {
        if (!this._open) return;

        const triggerRect = this.getBoundingClientRect();
        const dropdownWidth = this._dropdown.offsetWidth || 160;
        const dropdownHeight = this._dropdown.offsetHeight || 200;
        const gap = 4;

        let left;
        if (triggerRect.left + dropdownWidth + gap > window.innerWidth) {
            left = triggerRect.right + window.scrollX - dropdownWidth;
        } else {
            left = triggerRect.left + window.scrollX;
        }

        let top;
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        if (spaceBelow >= dropdownHeight + gap) {
            top = triggerRect.bottom + window.scrollY + gap;
        } else if (spaceAbove >= dropdownHeight + gap) {
            top = triggerRect.top + window.scrollY - dropdownHeight - gap;
        } else {
            top = triggerRect.bottom + window.scrollY + gap;
        }

        this._dropdown.style.left = `${left}px`;
        this._dropdown.style.top = `${top}px`;
    }

    _onOutsideClick(e) {
        if (!e.composedPath().includes(this)) this._hide();
    }

    _onKeyDown(e) {
        if (!this._open && ['ArrowDown', ' '].includes(e.key)) {
            e.preventDefault();
            this.open = true;
            return;
        }
        if (!this._open) return;

        const items = [...this._dropdown.querySelectorAll('.option')];
        const idx = items.findIndex(b => b.matches(':focus'));
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                items[(idx + 1) % items.length]?.focus();
                break;
            case 'ArrowUp':
                e.preventDefault();
                items[(idx - 1 + items.length) % items.length]?.focus();
                break;
            case 'Escape':
                e.preventDefault();
                this.open = false;
                this._trigger.focus();
                break;
        }
    }

    connectedCallback() {
        this._parseOptions();
        this._upgradeProperty('open');
    }

    _upgradeProperty(prop) {
        if (this.hasOwnProperty(prop)) {
            const v = this[prop];
            delete this[prop];
            this[prop] = v;
        }
    }

    disconnectedCallback() {
        this._hide();
    }
}

customElements.define('multi-buttons', MultiButtons);