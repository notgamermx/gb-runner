# Deploy GB Runner to Cloudflare Pages

GB Runner builds to a static `dist/` folder. There is no application server. GBA runs locally through `@gba-kit/gba-browser`; GB and GBC use the EmulatorJS CDN. Players' ROM files are selected in the browser and are not uploaded to Cloudflare.

On desktop, fullscreen scales the GBA's native 240×160 screen up to 1080×720. This enlarges the display; it does not change the game's native resolution.

## Deploy with Wrangler

1. Install Node.js 22.12 or newer.
2. From the project folder, install dependencies and sign in:

   ```powershell
   npm install
   npx wrangler login
   ```

3. Create a Cloudflare Pages project once (skip this if it already exists):

   ```powershell
   npx wrangler pages project create gb-runner --production-branch main
   ```

4. Build and deploy:

   ```powershell
   npm run build
   npx wrangler pages deploy dist --project-name gb-runner
   ```

Wrangler prints the deployment URL when the upload completes.

## Connect a Git repository

1. In Cloudflare, open **Workers & Pages** and create a Pages project connected to your Git repository.
2. Set the build command to `npm run build`.
3. Set the build output directory to `dist`.
4. Deploy. Cloudflare will build each push to the configured production branch.

## Preview locally

```powershell
npm install
npm run dev
```

Vite prints a local URL. An internet connection is required for EmulatorJS-based GB/GBC games.
