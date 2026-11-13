# GB Runner

A browser-based emulator for Game Boy, Game Boy Color, Game Boy Advance, and Nintendo DS. Choose a compatible game file from your device; it stays in your browser and is not uploaded.

- **GBA:** [`@gba-kit/gba-browser`](https://www.npmjs.com/package/@gba-kit/gba-browser), with keyboard/touch controls and browser-local save states.
- **GB/GBC:** EmulatorJS browser runtime from its CDN.
- **Nintendo DS:** GB Runner's player UI and controls, backed by the locally bundled Pilas-melonDS WebAssembly engine (MPL-2.0).

Use only game files you have permission to use. This project does not include game ROMs.

## Run locally

```powershell
npm ci
npm run dev
```

## Build

```powershell
npm run build
npm run preview
```

## Project layout

```text
index.html        Emulator interface
src/main.js       Emulator runtime and controls
public/nds/       Nintendo DS player and bundled engine
```
