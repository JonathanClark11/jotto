import { NextResponse } from 'next/server';

// Replace TEAM_ID with your 10-char Apple Developer Team ID
// (visible in Xcode → target → Signing & Capabilities, or developer.apple.com/account → Membership)
const AASA = {
  applinks: {
    details: [
      {
        appIDs: ['TEAM_ID.com.jonathanclark11.cinq'],
        components: [
          { '/': '/*', '?': { join: '?' } },
        ],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: { 'Content-Type': 'application/json' },
  });
}
