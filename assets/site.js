// Shared behaviour for every page. The theme and mode are applied early by a
// small inline script in each page's <head>, so there is no flash on load.

function store(key, value) {
    try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
    } catch (e) {
        return null;
    }
}

// Publication abstracts
function toggleDescription(btn) {
    const description = btn.previousElementSibling;
    description.classList.toggle('expanded');
    btn.textContent = description.classList.contains('expanded') ? 'Read less' : 'Read more';
}

document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;

    // ----- Light / dark theme -----
    const themeBtn = document.querySelector('.theme-toggle');
    const isDark = () => root.dataset.theme === 'dark' ||
        (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    // Shows the current theme, like the mode button shows the current mode
    const labelTheme = () => {
        themeBtn.textContent = isDark() ? '☾ dark' : '☀ light';
        themeBtn.setAttribute('aria-pressed', String(isDark()));
    };
    const syncScheme = () => { root.dataset.scheme = isDark() ? 'dark' : 'light'; };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        syncScheme();
        if (themeBtn) labelTheme();
    });
    if (themeBtn) {
        labelTheme();
        themeBtn.addEventListener('click', () => {
            root.dataset.theme = isDark() ? 'light' : 'dark';
            store('theme', root.dataset.theme);
            syncScheme();
            labelTheme();
        });
    }

    // ----- Evaluation / deployment mode -----
    // Evaluation is the plain site; deployment switches on the fun bits.
    const isDeploy = () => root.dataset.mode === 'deploy';
    const modeBtn = document.querySelector('.mode-toggle');
    const noteRefs = document.querySelectorAll('.note-ref');
    const applyMode = () => {
        modeBtn.querySelector('.label').textContent = isDeploy() ? 'deployment' : 'evaluation';
        modeBtn.setAttribute('aria-pressed', String(isDeploy()));
        // Notes are only interactive in deployment mode
        noteRefs.forEach(ref => {
            if (isDeploy()) {
                ref.setAttribute('role', 'button');
                ref.setAttribute('tabindex', '0');
            } else {
                ref.removeAttribute('role');
                ref.removeAttribute('tabindex');
                ref.setAttribute('aria-expanded', 'false');
            }
        });
    };
    if (modeBtn) {
        modeBtn.addEventListener('click', () => {
            root.dataset.mode = isDeploy() ? 'eval' : 'deploy';
            store('mode', root.dataset.mode);
            applyMode();
        });
    }

    // ----- Asides that open in place -----
    // These are spans with role="button" rather than <button>s, because buttons
    // can't wrap like text and would strand trailing punctuation on its own line.
    document.querySelectorAll('.note-ref').forEach(ref => {
        const toggle = () => {
            if (!isDeploy()) return;
            ref.setAttribute('aria-expanded', String(ref.getAttribute('aria-expanded') !== 'true'));
        };
        ref.setAttribute('aria-expanded', 'false');
        ref.addEventListener('click', toggle);
        ref.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
    });

    if (modeBtn) applyMode();

    // ----- Enigma email -----
    document.querySelectorAll('.enigma').forEach(setUpEnigma);

    // ----- Manatee: type "manatee" anywhere, or tap the footer waves -----
    let typed = '';
    document.addEventListener('keydown', e => {
        if (e.key.length !== 1) return;
        typed = (typed + e.key.toLowerCase()).slice(-7);
        if (typed === 'manatee' && isDeploy()) releaseManatee();
    });
    document.querySelectorAll('.manatee-trigger').forEach(b => b.addEventListener('click', releaseManatee));
});

// A faithful Enigma I: rotors I-II-III (left to right), reflector B, rings at A,
// no plugboard, with the middle-rotor double step. Enigma is its own inverse,
// so the same machine that encrypted the address decrypts it.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ROTORS = [
    { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
    { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
    { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
];
const REFLECTOR = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';

function makeEnigma(start) {
    const pos = [...start].map(c => ALPHA.indexOf(c));
    const notch = ROTORS.map(r => ALPHA.indexOf(r.notch));
    const forward = (i, c) => (ALPHA.indexOf(ROTORS[i].wiring[(c + pos[i]) % 26]) - pos[i] + 26) % 26;
    const backward = (i, c) => (ROTORS[i].wiring.indexOf(ALPHA[(c + pos[i]) % 26]) - pos[i] + 26) % 26;
    return {
        positions: () => pos.map(p => ALPHA[p]).join(''),
        // The letters the signal carries between components on the last key press:
        // key, after III, II, I, reflector, then back through I, II, III to the lamp
        trace: [],
        press(ch) {
            const upper = ch.toUpperCase();
            if (!ALPHA.includes(upper)) return ch;
            if (pos[1] === notch[1]) {
                pos[0] = (pos[0] + 1) % 26;
                pos[1] = (pos[1] + 1) % 26;
            } else if (pos[2] === notch[2]) {
                pos[1] = (pos[1] + 1) % 26;
            }
            pos[2] = (pos[2] + 1) % 26;
            let c = ALPHA.indexOf(upper);
            const trace = [c];
            for (const i of [2, 1, 0]) trace.push(c = forward(i, c));
            trace.push(c = ALPHA.indexOf(REFLECTOR[c]));
            for (const i of [0, 1, 2]) trace.push(c = backward(i, c));
            this.trace = trace.map(n => ALPHA[n]);
            return ch === upper ? ALPHA[c] : ALPHA[c].toLowerCase();
        },
    };
}

// Schematic of the machine, laid out like the real one: reflector on the left,
// rotors I-II-III, keyboard and lamps on the right. The signal runs right to left
// through the rotors, turns in the reflector, and comes back on a different wire.
const SVG_NS = 'http://www.w3.org/2000/svg';
const LAMP_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];

function buildMachine(panel) {
    const svgEl = (tag, attrs, text) => {
        const e = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        if (text !== undefined) e.textContent = text;
        return e;
    };
    const FWD_Y = 78, BACK_Y = 122;
    const svg = svgEl('svg', { viewBox: '0 0 640 186', class: 'enigma-svg' });

    // wires first, so components and letters draw over them
    svg.append(
        svgEl('path', { class: 'wire fwd', d: `M 556 ${FWD_Y} H 80` }),
        svgEl('path', { class: 'wire back', d: `M 80 ${BACK_Y} H 556` }),
    );

    const parts = [
        { x: 40, w: 40, name: 'UKW-B' },
        { x: 160, w: 60, name: 'I', rotor: 0 },
        { x: 290, w: 60, name: 'II', rotor: 1 },
        { x: 420, w: 60, name: 'III', rotor: 2 },
    ];
    const windows = [];
    for (const p of parts) {
        svg.append(svgEl('rect', { class: 'part', x: p.x, y: 48, width: p.w, height: 104, rx: 6 }));
        svg.append(svgEl('text', { class: 'part-label', x: p.x + p.w / 2, y: 174 }, p.name));
        if (p.rotor !== undefined) {
            svg.append(svgEl('rect', { class: 'window', x: p.x + p.w / 2 - 13, y: 12, width: 26, height: 26, rx: 4 }));
            const t = svgEl('text', { class: 'window-letter', x: p.x + p.w / 2, y: 30 }, '');
            svg.append(t);
            windows[p.rotor] = t;
        }
    }
    // the reflector's U-turn is drawn on top of its box so it stays visible
    svg.append(svgEl('path', { class: 'wire turn', d: `M 80 ${FWD_Y} H 60 V ${BACK_Y} H 80` }));
    svg.append(svgEl('rect', { class: 'part', x: 556, y: 48, width: 64, height: 104, rx: 6 }));
    svg.append(svgEl('text', { class: 'part-label small', x: 588, y: FWD_Y + 4 }, 'key'));
    svg.append(svgEl('text', { class: 'part-label small', x: 588, y: BACK_Y + 4 }, 'lamp'));

    // letter badges in the gaps between components, in signal order
    const gaps = [518, 385, 255, 120];
    const badgeAt = (x, y, cls) => {
        const g = svgEl('g', { class: 'badge ' + cls });
        g.append(svgEl('circle', { cx: x, cy: y, r: 11 }));
        const t = svgEl('text', { x, y: y + 4 }, '');
        g.append(t);
        svg.append(g);
        return t;
    };
    const badges = [
        ...gaps.map(x => badgeAt(x, FWD_Y, 'fwd')),
        ...[...gaps].reverse().map(x => badgeAt(x, BACK_Y, 'back')),
    ];

    const lamps = {};
    const board = document.createElement('div');
    board.className = 'lampboard';
    for (const row of LAMP_ROWS) {
        const r = document.createElement('div');
        for (const l of row) {
            const lamp = document.createElement('span');
            lamp.textContent = l;
            lamps[l] = lamp;
            r.append(lamp);
        }
        board.append(r);
    }

    const caption = document.createElement('p');
    caption.className = 'enigma-caption';

    panel.append(svg, board, caption);

    return {
        // trace: key, after III, II, I, reflector, back through I, II, III (the lamp)
        show(positions, trace) {
            [...positions].forEach((l, i) => { windows[i].textContent = l; });
            trace.forEach((l, i) => { badges[i].textContent = l; });
            Object.values(lamps).forEach(l => l.classList.remove('pressed', 'lit'));
            lamps[trace[0]].classList.add('pressed');
            lamps[trace[7]].classList.add('lit');
            caption.textContent = `key ${trace[0]} → III → II → I → reflector → I → II → III → lamp ${trace[7]}`;
            svg.classList.remove('pulse');
            void svg.getBoundingClientRect(); // restart the wire animation
            svg.classList.add('pulse');
        },
    };
}

function setUpEnigma(el) {
    const cipher = el.dataset.cipher;
    const start = el.dataset.start;
    const text = el.querySelector('.enigma-text');
    const rotors = el.querySelector('.enigma-rotors');
    const btn = el.querySelector('.enigma-btn');
    const panel = document.getElementById(el.dataset.machine);
    const showRotors = (letters) => {
        rotors.innerHTML = [...letters].map(l => `<span>${l}</span>`).join('');
    };
    text.textContent = cipher;
    showRotors(start);

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.addEventListener('click', () => {
        btn.disabled = true;
        const machine = makeEnigma(start);
        const diagram = panel ? buildMachine(panel) : null;
        if (panel) panel.classList.add('open');
        const out = [...cipher];
        let i = 0;
        const step = () => {
            if (i >= cipher.length) {
                const address = out.join('');
                text.innerHTML = `<a href="mailto:${address}">${address}</a>`;
                btn.textContent = 'copy';
                btn.disabled = false;
                btn.onclick = () => {
                    navigator.clipboard?.writeText(address);
                    btn.textContent = 'copied ✓';
                };
                return;
            }
            const isLetter = ALPHA.includes(cipher[i].toUpperCase());
            out[i] = machine.press(cipher[i]);
            text.textContent = out.join('');
            showRotors(machine.positions());
            rotors.lastElementChild.classList.add('tick');
            if (diagram && isLetter) diagram.show(machine.positions(), machine.trace);
            i++;
            // slow enough to follow each letter through the machine; punctuation passes straight through
            setTimeout(step, reduceMotion || !isLetter ? 0 : 280);
        };
        step();
    }, { once: true });
}

function releaseManatee() {
    const m = document.querySelector('.manatee');
    if (!m || m.classList.contains('swimming')) return;
    m.hidden = false;
    m.classList.add('swimming');
    setTimeout(() => {
        m.classList.remove('swimming');
        m.hidden = true;
    }, 9500);
}
