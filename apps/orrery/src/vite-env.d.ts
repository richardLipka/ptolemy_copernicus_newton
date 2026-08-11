/**
 * Vite's ambient module types.
 *
 * Needed for the `?raw` imports in the footer, which pull the two institutional
 * SVGs in as strings so their fills can be `currentColor` rather than the flat
 * white the university ships. Without this reference those imports have no type
 * and `tsc --noEmit` fails the build.
 */
/// <reference types="vite/client" />
