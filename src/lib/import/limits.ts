/**
 * Import-endpoint caps (plan §10.1, POC-enforced): shared between the server
 * route (enforcement) and the client module (early rejection with a friendly
 * message before any upload).
 */
export const MAX_PUB_BYTES = 25 * 1024 * 1024;
export const CONVERT_TIMEOUT_MS = 20_000;
