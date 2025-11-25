class ValorantCrosshair {
    constructor() {
        this.COLORS = {
            0: '#FFFFFF', 1: '#00FF00', 2: '#7FFF00', 3: '#DFFF00',
            4: '#FFFF00', 5: '#00FFFF', 6: '#FF00FF', 7: '#FF0000'
        };
    }

    parse(code) {
        const s = {
            color: '#FFFFFF',
            outlines: false, outlineThickness: 1, outlineOpacity: 0.5,
            centerDot: false, centerDotOpacity: 1, centerDotThickness: 2,
            inner: { show: true, opacity: 0.8, thickness: 2, offset: 3, horizLength: 6, vertLength: null },
            outer: { show: true, opacity: 0.35, thickness: 2, offset: 10, horizLength: 2, vertLength: null }
        };

        if (!code) return s;
        const parts = code.split(';');

        for (let i = 0; i < parts.length; i++) {
            const k = parts[i];
            const v = parts[i + 1];

            if (k === 'c') s.color = this.COLORS[v] || '#FFFFFF';
            if (k === 'u') s.color = '#' + v;
            if (k === 'h') s.outlines = (v === '1');
            if (k === 't') s.outlineThickness = parseFloat(v);
            if (k === 'o') s.outlineOpacity = parseFloat(v);
            if (k === 'd') s.centerDot = (v === '1');
            if (k === 'z') s.centerDotThickness = parseFloat(v);
            if (k === 'a') s.centerDotOpacity = parseFloat(v);

            if (k === '0b') s.inner.show = (v === '1');
            if (k === '0t') s.inner.thickness = parseFloat(v);
            if (k === '0l') s.inner.horizLength = parseFloat(v);
            if (k === '0v') s.inner.vertLength = parseFloat(v);
            if (k === '0o') s.inner.offset = parseFloat(v);
            if (k === '0a') s.inner.opacity = parseFloat(v);

            if (k === '1b') s.outer.show = (v === '1');
            if (k === '1t') s.outer.thickness = parseFloat(v);
            if (k === '1l') s.outer.horizLength = parseFloat(v);
            if (k === '1v') s.outer.vertLength = parseFloat(v);
            if (k === '1o') s.outer.offset = parseFloat(v);
            if (k === '1a') s.outer.opacity = parseFloat(v);
        }

        if (s.inner.vertLength === null) s.inner.vertLength = s.inner.horizLength;
        if (s.outer.vertLength === null) s.outer.vertLength = s.outer.horizLength;

        if (code.includes('o;1') && !code.includes('h;0')) s.outlines = true;

        return s;
    }

    _getLayerRects(cx, cy, type, config, global, scale) {
        let rects = [];

        if (type === 'dot') {
            if (!global.centerDot) return [];
            const size = global.centerDotThickness * scale;
            rects.push({ x: cx - size / 2, y: cy - size / 2, w: size, h: size });
        } else {
            if (!config.show) return [];

            const t = config.thickness * scale;
            const o = config.offset * scale;
            const hLen = config.horizLength * scale;
            const vLen = config.vertLength * scale;
            const tHalf = t / 2;

            if (hLen > 0) {
                rects.push({ x: cx - o - hLen, y: cy - tHalf, w: hLen, h: t });
                rects.push({ x: cx + o, y: cy - tHalf, w: hLen, h: t });
            }

            if (vLen > 0) {
                rects.push({ x: cx - tHalf, y: cy - o - vLen, w: t, h: vLen });
                rects.push({ x: cx - tHalf, y: cy + o, w: t, h: vLen });
            }
        }
        return rects;
    }
}