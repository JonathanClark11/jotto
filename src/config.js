// Change this one value when the final name is chosen.
export const APP_NAME = "Cinqle";

// Turn expiry: the player on turn forfeits if they have not played within TURN_EXPIRY_DAYS (see docs/turn-expiry.md).
// Kill switch: server enforcement is a no-op while this is false.
export const TURN_EXPIRY_ENABLED = false;
export const TURN_EXPIRY_DAYS = 14;
export const TURN_EXPIRY_MS = TURN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const TURN_WARN_DAYS = [3, 1];
