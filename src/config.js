// Change this one value when the final name is chosen.
export const APP_NAME = "Cinqle";

export const APP_STORE_ID = "6813995313";
export const APP_STORE_URL = "https://apps.apple.com/us/app/cinqle/id6813995313";

// Flip to true once an App Store build that registers the cinqle:// scheme (1.2 and later) is live.
// Until then the landing page hides "Open in Cinqle", because older installs would show an error.
export const OPEN_IN_APP_ENABLED = false;
export const APP_SCHEME = "cinqle";

// Turn expiry: the player on turn forfeits if they have not played within TURN_EXPIRY_DAYS (see docs/turn-expiry.md).
// Kill switch: server enforcement is a no-op while this is false.
export const TURN_EXPIRY_ENABLED = false;
export const TURN_EXPIRY_DAYS = 14;
export const TURN_EXPIRY_MS = TURN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const TURN_WARN_DAYS = [3, 1];
