export const MATCH_CODE_LENGTH = 8;
export const FRIEND_ID_LENGTH = 6;

// Match codes are typed by hand, so strip anything outside the code alphabet.
export function normalizeMatchCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, MATCH_CODE_LENGTH);
}

// Returns an error message, or '' when the code is ready to send.
export function matchCodeError(code) {
  return code.length === MATCH_CODE_LENGTH ? '' : `Enter the ${MATCH_CODE_LENGTH}-character match code`;
}

// Returns an error message, or '' when the (already normalized) friend ID can be sent.
export function friendIdError(code, ownCode) {
  if (code.length !== FRIEND_ID_LENGTH) return `Friend IDs are ${FRIEND_ID_LENGTH} characters`;
  if (code === ownCode) return 'That is your own friend ID';
  return '';
}
