import {
    EmulatorBridge,
    computeRomHash,
    listByRom,
    loadState,
    saveState,
} from '@gba-kit/gba-browser';

const elements = {
    input: document.getElementById('rom-input'),
    status: document.getElementById('status'),
    statusLight: document.getElementById('statusLight'),
    welcome: document.getElementById('welcome'),
    game: document.getElementById('game'),
    screen: document.getElementById('screen'),
    uploadLabel: document.getElementById('uploadLabel'),
    fullscreenButton: document.getElementById('fullscreenButton'),
    changeGameButton: document.getElementById('changeGameButton'),
    controlsHelp: document.getElementById('controlsHelp'),
};

const supportedExtensions = new Set(['gb', 'gbc', 'gba', 'nds']);
const emulatorDataPath = 'https://cdn.emulatorjs.org/stable/data/';
let gbaEmulator = null;
let gbaRomHash = null;
let ndsRomUrl = null;
let loading = false;

function setStatus(message, state = '') {
    elements.status.textContent = message;
    elements.statusLight.className = `status-light${state ? ` ${state}` : ''}`;
}

function showGameControls() {
    elements.welcome.hidden = true;
    elements.fullscreenButton.hidden = false;
    elements.changeGameButton.hidden = false;
}

function setLoading(isLoading) {
    loading = isLoading;
    elements.uploadLabel.setAttribute('aria-disabled', String(isLoading));
    elements.uploadLabel.textContent = isLoading ? 'Starting emulator…' : 'Choose a game file';
    elements.input.disabled = isLoading;
}

function createGbaControls() {
    const controls = document.createElement('div');
    controls.className = 'emulator-controls';
    controls.innerHTML = `
        <button class="small-button" id="powerButton" type="button">Start</button>
        <button class="small-button" id="audioButton" type="button">Enable sound</button>
        <button class="small-button" id="saveButton" type="button">Save state</button>
        <button class="small-button" id="loadStateButton" type="button" disabled>No saves</button>
    `;

    const touchControls = document.createElement('div');
    touchControls.className = 'touch-controls';
    touchControls.setAttribute('aria-label', 'Touch game controls');
    const buttons = [
        ['UP', '▲', 'ArrowUp', 'touch-up'],
        ['LEFT', '◀', 'ArrowLeft', 'touch-left'],
        ['RIGHT', '▶', 'ArrowRight', 'touch-right'],
        ['DOWN', '▼', 'ArrowDown', 'touch-down'],
        ['SELECT', 'Select', 'Backspace', 'touch-select'],
        ['START', 'Start', 'Enter', 'touch-start'],
        ['B', 'B', 'x', 'touch-b'],
        ['A', 'A', 'z', 'touch-a'],
        ['L', 'L', 's', 'touch-l'],
        ['R', 'R', 'a', 'touch-r'],
    ];

    for (const [label, text, key, position] of buttons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `touch-button ${position}`;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.addEventListener('pointerdown', event => {
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            gbaEmulator.handleKeyDown(new KeyboardEvent('keydown', { key, cancelable: true }));
        });
        const release = event => {
            if (event.cancelable) event.preventDefault();
            gbaEmulator.handleKeyUp(new KeyboardEvent('keyup', { key, cancelable: true }));
        };
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
        touchControls.appendChild(button);
    }

    return { controls, touchControls };
}

function renderSaveSlots(slots, button) {
    if (slots.length === 0) {
        button.textContent = 'No saves';
        button.disabled = true;
        button.onclick = null;
        return;
    }

    button.textContent = `Load save (${slots.length})`;
    button.disabled = false;
    button.onclick = async () => {
        const slot = slots[0];
        try {
            const record = await loadState(slot.id);
            if (!record) {
                throw new Error('The saved state could not be found.');
            }
            gbaEmulator.loadState(record.snapshot);
            setStatus(`Loaded ${record.label}`, 'ready');
        } catch (error) {
            setStatus(`Could not load save: ${error.message}`, 'error');
        }
    };
}

async function startGba(source, fileName = source.name, autoStart = false) {
    setStatus(`Reading ${fileName}…`, 'loading');
    const rom = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const player = document.createElement('div');
    player.id = 'gba-player';
    player.innerHTML = '<canvas id="gba-canvas" width="240" height="160" aria-label="Game Boy Advance screen"></canvas>';
    const { controls, touchControls } = createGbaControls();
    player.append(controls, touchControls);
    elements.game.replaceChildren(player);

    gbaEmulator = new EmulatorBridge();
    gbaEmulator.attachCanvas(player.querySelector('#gba-canvas'));
    gbaEmulator.setCallbacks({
        onStateChange: state => {
            const powerButton = player.querySelector('#powerButton');
            powerButton.textContent = state === 'running' ? 'Pause' : 'Start';
        },
        onFrame: () => {},
        onBreakpoint: () => {},
    });

    gbaEmulator.loadRom(rom);
    showGameControls();
    setStatus(fileName, 'ready');
    elements.controlsHelp.innerHTML = '<strong>GBA controls:</strong> arrows · Z/X = A/B · A/S = R/L · Enter/Backspace = Start/Select.';

    player.querySelector('#powerButton').addEventListener('click', () => {
        if (gbaEmulator.state === 'running') {
            gbaEmulator.pause();
        } else {
            gbaEmulator.run();
        }
    });
    player.querySelector('#audioButton').addEventListener('click', event => {
        try {
            const enabled = gbaEmulator.toggleAudio();
            event.currentTarget.textContent = enabled ? 'Mute sound' : 'Enable sound';
        } catch (error) {
            setStatus(`Could not enable sound: ${error.message}`, 'error');
        }
    });
    player.querySelector('#saveButton').addEventListener('click', async event => {
        const saveButton = event.currentTarget;
        const wasRunning = gbaEmulator.state === 'running';
        saveButton.disabled = true;
        try {
            const { snapshot, thumbnail } = await gbaEmulator.saveState();
            const id = await saveState(gbaRomHash, snapshot, thumbnail, `Save ${new Date().toLocaleString()}`);
            setStatus(`Game saved (slot ${id}).`, 'ready');
            const slots = await listByRom(gbaRomHash);
            renderSaveSlots(slots, player.querySelector('#loadStateButton'));
        } catch (error) {
            setStatus(`Could not save game: ${error.message}`, 'error');
        } finally {
            saveButton.disabled = false;
            if (wasRunning && gbaEmulator.state !== 'running') gbaEmulator.run();
        }
    });

    try {
        gbaRomHash = await computeRomHash(rom);
        const slots = await listByRom(gbaRomHash);
        renderSaveSlots(slots, player.querySelector('#loadStateButton'));
    } catch (error) {
        setStatus(`Save states are unavailable: ${error.message}`, 'error');
    }

    window.addEventListener('keydown', event => gbaEmulator?.handleKeyDown(event));
    window.addEventListener('keyup', event => gbaEmulator?.handleKeyUp(event));

    if (autoStart) gbaEmulator.run();
}

function startGb(source, fileName = source.name) {
    setStatus(`Loading ${fileName}…`, 'loading');
    elements.controlsHelp.innerHTML = '<strong>GB/GBC controls:</strong> use the emulator on-screen controls or keyboard.';

    window.EJS_player = '#game';
    window.EJS_gameName = fileName.replace(/\.[^.]+$/, '');
    window.EJS_biosUrl = '';
    window.EJS_gameUrl = source;
    window.EJS_core = 'gb';
    window.EJS_pathtodata = emulatorDataPath;
    window.EJS_startOnLoaded = true;
    window.EJS_ready = () => {
        showGameControls();
        setStatus(fileName, 'ready');
        setLoading(false);
    };

    const loader = document.createElement('script');
    loader.src = `${emulatorDataPath}loader.js`;
    loader.onerror = () => {
        setStatus('Could not load the GB/GBC emulator. Check your internet connection and try again.', 'error');
        setLoading(false);
        loader.remove();
    };
    document.body.appendChild(loader);
}

async function startNds(source, fileName = source.name) {
    const rom = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    if (ndsRomUrl) URL.revokeObjectURL(ndsRomUrl);
    ndsRomUrl = URL.createObjectURL(new Blob([rom], { type: 'application/octet-stream' }));

    const frame = document.createElement('iframe');
    frame.className = 'nds-player-frame';
    frame.title = `Nintendo DS player: ${fileName}`;
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    const emulatorUrl = new URL('/nds/index.html', window.location.origin);
    emulatorUrl.searchParams.set('rom', ndsRomUrl);
    emulatorUrl.searchParams.set('name', fileName);
    frame.src = emulatorUrl.href;

    elements.game.replaceChildren(frame);
    showGameControls();
    setStatus(fileName, 'ready');
    elements.controlsHelp.innerHTML = '<strong>Nintendo DS controls:</strong> arrows + Z/X/A/S/Enter/Backspace, or the on-screen controls on touch devices.';
}

async function launchGame(file) {
    if (loading) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!supportedExtensions.has(extension)) {
        setStatus('Unsupported file. Choose a .gb, .gbc, .gba, or .nds game.', 'error');
        return;
    }

    setLoading(true);
    try {
        if (extension === 'nds') {
            await startNds(file);
            setLoading(false);
        } else if (extension === 'gba') {
            await startGba(file);
            setLoading(false);
        } else {
            startGb(file);
        }
    } catch (error) {
        setStatus(`Could not start the emulator: ${error.message}`, 'error');
        elements.game.replaceChildren();
        setLoading(false);
    }
}

elements.input.addEventListener('change', () => {
    const file = elements.input.files[0];
    elements.input.value = '';
    if (file) void launchGame(file);
});

elements.screen.addEventListener('dragover', event => {
    event.preventDefault();
    elements.screen.style.outline = '2px dashed #c4f05b';
    elements.screen.style.outlineOffset = '-8px';
});

elements.screen.addEventListener('dragleave', event => {
    if (!elements.screen.contains(event.relatedTarget)) {
        elements.screen.style.outline = '';
        elements.screen.style.outlineOffset = '';
    }
});

elements.screen.addEventListener('drop', event => {
    event.preventDefault();
    elements.screen.style.outline = '';
    elements.screen.style.outlineOffset = '';
    const file = event.dataTransfer.files[0];
    if (file) void launchGame(file);
});

elements.fullscreenButton.addEventListener('click', async () => {
    try {
        if (!document.fullscreenElement) {
            await elements.screen.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        setStatus(`Could not enter full screen: ${error.message}`, 'error');
    }
});

document.addEventListener('fullscreenchange', () => {
    elements.fullscreenButton.textContent =
        document.fullscreenElement === elements.screen ? 'Exit full screen' : 'Full screen';
});

elements.changeGameButton.addEventListener('click', () => window.location.reload());

const localGameProfiles = {
    blue: { title: 'Pokémon Blue Version', accept: '.gb,.gbc' },
    emerald: { title: 'Pokémon Emerald Version', accept: '.gba' },
    leafgreen: { title: 'Pokémon LeafGreen Version', accept: '.gba' },
    ruby: { title: 'Pokémon Ruby Version', accept: '.gba' },
    sapphire: { title: 'Pokémon Sapphire Version', accept: '.gba' },
};

const selectedLocalGame = new URLSearchParams(window.location.search).get('pick');
const localGameProfile = localGameProfiles[selectedLocalGame];
if (localGameProfile) {
    elements.welcome.querySelector('h2').textContent = `Choose your copy of ${localGameProfile.title}`;
    elements.welcome.querySelector('p').textContent =
        `Select a compatible ${localGameProfile.accept} file from your device. It stays in your browser and is not uploaded to this website.`;
    elements.uploadLabel.textContent = `Choose ${localGameProfile.title} file`;
    elements.input.accept = localGameProfile.accept;
    setStatus(`Ready for your local copy of ${localGameProfile.title}.`, 'ready');
}
