const canvas = document.getElementById('screenCanvas');
const context = canvas.getContext('2d', { alpha: false });
const status = document.getElementById('gameStatus');
const romInput = document.getElementById('romInput');
const pauseButton = document.getElementById('pauseButton');
const audioButton = document.getElementById('audioButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const bytesPerFrame = 256 * 192 * 4 * 2;
const saveDirectory = '/gb-runner/saves';
const keyCodes = new Map([
  ['KeyZ', 0], ['KeyX', 1], ['Backspace', 2], ['Enter', 3],
  ['ArrowRight', 4], ['ArrowLeft', 5], ['ArrowUp', 6], ['ArrowDown', 7],
  ['KeyW', 8], ['KeyQ', 9], ['KeyS', 10], ['KeyA', 11],
]);

let core;
let machine;
let savePath = '';
let keyboardMask = 0xfff;
let touchMask = 0xfff;
let gamepadMask = 0xfff;
let paused = false;
let lastTick = 0;
let accumulator = 0;
let saveSyncing = false;
let audioContext;
let audioNode;
let audioBuffer = 0;
let romHash = '';
let romLoaded = false;

function setStatus(message) { status.textContent = message; }

function cString(pointer) {
  if (!pointer) return '';
  let end = pointer;
  while (core.HEAPU8[end]) end++;
  return new TextDecoder().decode(core.HEAPU8.subarray(pointer, end));
}

function alloc(bytes) {
  const pointer = core._malloc(bytes.length || 1);
  if (bytes.length) core.HEAPU8.set(bytes, pointer);
  return pointer;
}

function ensureDirectory(path) {
  try { core.FS.mkdirTree(path); } catch {}
}

function syncFileSystem(populate) {
  return new Promise((resolve, reject) => core.FS.syncfs(populate, error => error ? reject(error) : resolve()));
}

function updateKeys() {
  if (core && machine) core._pilas_set_key_mask(machine, keyboardMask & touchMask & gamepadMask);
}

function setBit(source, bit, down) {
  const mask = 1 << bit;
  if (source === 'keyboard') keyboardMask = down ? keyboardMask & ~mask : keyboardMask | mask;
  else touchMask = down ? touchMask & ~mask : touchMask | mask;
  updateKeys();
}

function clearKeyboard() {
  keyboardMask = 0xfff;
  updateKeys();
}

function pollGamepad() {
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (!pad) { gamepadMask = 0xfff; updateKeys(); return; }
  let mask = 0xfff;
  const press = bit => { mask &= ~(1 << bit); };
  if (pad.buttons[1]?.pressed) press(0);
  if (pad.buttons[0]?.pressed) press(1);
  if (pad.buttons[8]?.pressed) press(2);
  if (pad.buttons[9]?.pressed) press(3);
  if (pad.buttons[15]?.pressed || pad.axes[0] > .5) press(4);
  if (pad.buttons[14]?.pressed || pad.axes[0] < -.5) press(5);
  if (pad.buttons[12]?.pressed || pad.axes[1] < -.5) press(6);
  if (pad.buttons[13]?.pressed || pad.axes[1] > .5) press(7);
  if (pad.buttons[5]?.pressed) press(8);
  if (pad.buttons[4]?.pressed) press(9);
  if (pad.buttons[3]?.pressed) press(10);
  if (pad.buttons[2]?.pressed) press(11);
  gamepadMask = mask;
  updateKeys();
}

async function loadRom(bytes, filename) {
  if (!core || !machine) throw new Error('DS engine is still starting.');
  if (savePath) await saveGame(true);

  const safeName = filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48) || 'game';
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  romHash = [...new Uint8Array(digest).slice(0, 8)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const nextSavePath = `${saveDirectory}/${safeName}-${romHash}.sav`;
  const saved = core.FS.analyzePath(nextSavePath).exists ? core.FS.readFile(nextSavePath) : new Uint8Array();
  const nameBytes = new TextEncoder().encode(`${filename}\0`);
  const romPointer = alloc(bytes);
  const savePointer = alloc(saved);
  const namePointer = alloc(nameBytes);
  try {
    core._pilas_set_console_mode(machine, 0, 1);
    core._pilas_set_direct_boot(machine, 1);
    const loaded = core._pilas_load_rom(machine, romPointer, bytes.length, savePointer, saved.length, namePointer);
    if (!loaded) throw new Error(cString(core._pilas_last_error()) || 'The DS core could not load this ROM.');
    savePath = nextSavePath;
    romLoaded = true;
  } finally {
    core._free(romPointer);
    core._free(savePointer);
    core._free(namePointer);
  }

  paused = false;
  pauseButton.disabled = false;
  pauseButton.textContent = 'Pause';
  canvas.focus();
  setStatus(filename);
}

function drawFrame() {
  const pointer = core._pilas_get_framebuffer_ptr(machine);
  if (!pointer || core._pilas_get_framebuffer_size(machine) < bytesPerFrame) return;
  const pixels = new Uint8ClampedArray(core.HEAPU8.subarray(pointer, pointer + bytesPerFrame));
  context.putImageData(new ImageData(pixels, 256, 384), 0, 0);
}

async function saveGame(force = false) {
  if (!core || !machine || !romLoaded || saveSyncing || !savePath) return;
  if (!force && !core._pilas_take_nds_save_dirty(machine)) return;
  saveSyncing = true;
  try {
    const pointer = core._pilas_get_nds_save_ptr(machine);
    const length = core._pilas_get_nds_save_length(machine);
    if (pointer && length > 0) core.FS.writeFile(savePath, Uint8Array.from(core.HEAPU8.subarray(pointer, pointer + length)));
    await syncFileSystem(false);
  } catch (error) {
    console.error(error);
    setStatus(`Save could not be synced: ${error.message}`);
  } finally {
    saveSyncing = false;
  }
}

function frame(now) {
  if (!lastTick) lastTick = now;
  const elapsed = Math.min(now - lastTick, 250);
  lastTick = now;
  if (core && machine && romLoaded && !paused) {
    accumulator += elapsed;
    let count = 0;
    while (accumulator >= 1000 / 60 && count < 5) {
      core._pilas_run_frame(machine);
      if (audioContext?.state === 'running' && audioBuffer) {
        const frames = core._pilas_pull_audio(machine, audioBuffer, 2048);
        if (frames > 0) {
          const start = audioBuffer >> 1;
          const pcm = core.HEAP16.subarray(start, start + frames * 2);
          const samples = Float32Array.from(pcm, sample => sample / 32768);
          audioNode.port.postMessage({ samples }, [samples.buffer]);
        }
      }
      accumulator -= 1000 / 60;
      count++;
    }
    if (count) drawFrame();
    if (now % 1000 < elapsed) void saveGame();
    pollGamepad();
  }
  requestAnimationFrame(frame);
}

async function startAudio() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      await audioContext.audioWorklet.addModule('./src/audio-worklet.js');
      audioNode = new AudioWorkletNode(audioContext, 'gb-runner-ds-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      audioNode.connect(audioContext.destination);
      audioBuffer = core._malloc(2048 * 2 * 2);
    }
    await audioContext.resume();
    audioButton.textContent = 'Mute sound';
  } catch (error) { setStatus(`Sound unavailable: ${error.message}`); }
}

romInput.addEventListener('change', async () => {
  const file = romInput.files?.[0];
  romInput.value = '';
  if (!file) return;
  try { await loadRom(new Uint8Array(await file.arrayBuffer()), file.name); }
  catch (error) { setStatus(`Could not load game: ${error.message}`); }
});

pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  setStatus(paused ? 'Paused' : 'Running');
});

audioButton.addEventListener('click', async () => {
  if (audioContext?.state === 'running') {
    await audioContext.suspend();
    audioButton.textContent = 'Enable sound';
  } else await startAudio();
});

fullscreenButton.addEventListener('click', async () => {
  if (!document.fullscreenElement) await document.querySelector('.ds-app').requestFullscreen();
  else await document.exitFullscreen();
});

window.addEventListener('keydown', event => {
  const bit = keyCodes.get(event.code);
  if (bit === undefined) return;
  event.preventDefault();
  setBit('keyboard', bit, true);
});
window.addEventListener('keyup', event => {
  const bit = keyCodes.get(event.code);
  if (bit !== undefined) { event.preventDefault(); setBit('keyboard', bit, false); }
});
window.addEventListener('blur', clearKeyboard);

for (const button of document.querySelectorAll('[data-bit]')) {
  const bit = Number(button.dataset.bit);
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setBit('touch', bit, true);
  });
  const release = event => { event.preventDefault(); setBit('touch', bit, false); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

canvas.addEventListener('pointerdown', event => {
  if (!core || !machine) return;
  const bounds = canvas.getBoundingClientRect();
  const x = Math.round((event.clientX - bounds.left) * 256 / bounds.width);
  const y = Math.round((event.clientY - bounds.top) * 384 / bounds.height) - 192;
  core?._pilas_set_touch(machine, x, y, y >= 0 ? 1 : 0);
});
canvas.addEventListener('pointerup', () => { if (core && machine) core._pilas_set_touch(machine, 0, 0, 0); });
canvas.addEventListener('pointercancel', () => { if (core && machine) core._pilas_set_touch(machine, 0, 0, 0); });

async function boot() {
  try {
    setStatus('Starting DS engine…');
    const factory = (await import('../pilas-melonds-core.js')).default;
    core = await factory({ locateFile: path => new URL(`../${path}`, import.meta.url).href });
    core.FS.mkdir('/gb-runner');
    core.FS.mount(core.IDBFS, {}, '/gb-runner');
    await syncFileSystem(true);
    ensureDirectory(saveDirectory);
    await syncFileSystem(false);
    machine = core._pilas_create(48000);
    if (!machine) throw new Error(cString(core._pilas_last_error()) || 'The DS engine did not start.');
    core._pilas_set_console_mode(machine, 0, 1);
    core._pilas_set_direct_boot(machine, 1);
    audioButton.disabled = false;
    requestAnimationFrame(frame);

    const romUrl = new URL(location.href).searchParams.get('rom');
    if (romUrl) {
      const source = new URL(romUrl, location.href);
      if (source.origin !== location.origin) throw new Error('The ROM must come from this site.');
      const response = await fetch(source);
      if (!response.ok) throw new Error(`ROM request failed with HTTP ${response.status}.`);
      await loadRom(new Uint8Array(await response.arrayBuffer()), new URL(location.href).searchParams.get('name') || decodeURIComponent(source.pathname.split('/').pop() || 'game.nds'));
    } else setStatus('Choose a Nintendo DS game to begin.');
  } catch (error) {
    console.error(error);
    setStatus(`DS engine error: ${error.message}`);
  }
}

window.addEventListener('pagehide', () => { void saveGame(true); });
void boot();
