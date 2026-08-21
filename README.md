# Retro Pocket / Emulator

A personal browser-based SNES player powered by EmulatorJS.

## What it does

- Opens `.sfc` and `.smc` ROM files selected from your device.
- Runs the game in the browser with EmulatorJS.
- Works as a static site, so it can be hosted with GitHub Pages.
- Does not upload the selected ROM to this repository.
- Includes mobile-first UI for iPhone/iPad use.

## Run locally

Serve the repository with any static HTTP server and open `index.html` through that server. Choose a ROM file using the button on the page.

> Some browser features do not work correctly when `index.html` is opened directly with a `file://` URL, so an HTTP server or GitHub Pages is recommended.

## ROMs and copyright

No game ROMs are included in this repository. Use only game files you are legally entitled to use. Do not commit copyrighted commercial ROMs to this repository.

## Emulator engine

The player loads EmulatorJS runtime files from the official stable CDN:

`https://cdn.emulatorjs.org/stable/data/`
