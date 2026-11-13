# Local setup

GB Runner is a static browser app. It does not need a storage account or server. ROM files are selected locally and are not uploaded.

## Start the app

From the project folder:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Build and preview

```powershell
npm run build
npm run preview
```

The generated site is written to `dist/`. No credentials or environment variables are required.
