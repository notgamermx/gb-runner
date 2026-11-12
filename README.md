# GB Runner

GB Runner is a browser-based emulator for Game Boy, Game Boy Color, and Game Boy Advance games. Select a `.gb`, `.gbc`, or `.gba` file from your device; ROMs are read locally and are not uploaded to the site.

- **GBA:** emulated with [`@gba-kit/gba-browser`](https://www.npmjs.com/package/@gba-kit/gba-browser), with keyboard/touch controls and browser-local save states.
- **GB/GBC:** emulated with the EmulatorJS browser runtime, loaded from its CDN.
- **Display:** fullscreen can scale the GBA's native 240×160 picture up to 1080×720 while keeping its pixel-art appearance.

An internet connection is required to load the emulator runtime. Use only game files you have the right to use; this project does not include or host ROMs.

## Run locally

```powershell
npm install
npm run dev
```

Vite prints a local URL to open in your browser.

## Deploy to Cloudflare Pages

See [SETUP.md](./SETUP.md) for CLI and Git-connected deployment instructions.

## Project layout

```text
index.html        GB Runner interface
src/main.js       GBA runtime, GB/GBC integration, and controls
public/_headers   Cloudflare Pages response headers
dist/             Generated static site (build output)
wrangler.toml     Cloudflare Pages configuration
```
