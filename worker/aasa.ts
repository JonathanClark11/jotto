// iOS Universal Links manifest. Served from the Worker because vinext does not route
// dot-prefixed app directories (app/.well-known/... returns 404). Apple Team ID P55DBCXQCB.
// In Apple's component syntax "?" matches exactly one character and "*" matches zero or
// more, so "?*" means "at least one character".
export const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["P55DBCXQCB.com.jonathanclark11.cinq"],
        components: [
          { "/": "/*", "?": { join: "?*" } },
          { "/": "/*", "?": { friend: "?*" } },
        ],
      },
    ],
  },
};
