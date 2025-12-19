// Deterministic component color generator (stable per index).
function hslToHex(h, s, l) {
    // h in [0,1], s/l in [0,1]
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    const toHex = (x) => {
        const v = Math.round(x * 255);
        return v.toString(16).padStart(2, "0");
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getComponentColor(componentIndex) {
    const idx = Math.max(0, componentIndex || 0);
    const hue = ((idx * 0.12745) % 1 + 1) % 1; // golden-ish offset for spread
    const saturation = 0.68;
    const lightness = 0.55;
    return hslToHex(hue, saturation, lightness);
}
