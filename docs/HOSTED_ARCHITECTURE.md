# Hosted Architecture

Mitosis.in now uses a hybrid model:

- Figma plugin: lightweight executor and document bridge.
- Web app: fullscreen workflow UI, node graph, mapping, pipeline control, and frame dock.
- Bridge server: WebSocket relay that pairs the hosted app with the plugin by session ID.

## Local Run

Install workspace dependencies:

```bash
npm install --prefix web --legacy-peer-deps
npm install --prefix bridge --legacy-peer-deps
```

Start the bridge:

```bash
npm run dev --prefix bridge
```

Start the hosted app:

```bash
npm run dev --prefix web
```

Open:

```text
http://localhost:5173?session=<plugin-session>&bridge=ws://localhost:8787
```

The plugin bridge displays the session ID and can open the app with the correct query params.

## DigitalOcean Deployment

Recommended split:

- App Platform static site for `web/`.
- App Platform service or Droplet for `bridge/`.
- Configure the hosted app URL with a secure bridge URL, for example:

```text
https://app.mitosis.in?bridge=wss://bridge.mitosis.in
```

The plugin remains lightweight. It only forwards document metadata to the bridge and applies commands received from the hosted app.

## Message Flow

1. Plugin UI registers as `role: plugin` with the WebSocket bridge.
2. Hosted app registers as `role: app` with the same session ID.
3. Plugin sends `template-metadata`, `frames-loaded`, and `generation-complete` events.
4. Hosted app sends existing plugin commands such as `import-mapped-data`, `import-multi-ratio`, `export-data`, and `refresh-document`.
5. `code.ts` applies the command to the Figma canvas and never closes the plugin automatically.

## Output Contract

Generated frames receive:

- Deterministic names: `Campaign_A / Variant_01`, or `Campaign_A / 1:1 / Variant_01`.
- Plugin data: `mitosis:generationId`, `mitosis:campaignName`, `mitosis:variantSetName`, `mitosis:ratioName`, `mitosis:sourceRow`, and `mitosis:mappingConfig`.
- A Figma section named `Campaign_A / Variant_Set_1` sized around the output group.
