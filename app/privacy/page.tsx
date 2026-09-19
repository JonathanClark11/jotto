export const metadata = {
  title: "Privacy Policy — Cinqle",
};

export default function PrivacyPolicy() {
  const updated = "September 6, 2026";
  const contact = "jonathanclark11@gmail.com";

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px", fontFamily: "system-ui, sans-serif", lineHeight: 1.7, color: "#1C1B18" }}>
      <a href="/" style={{ display: "inline-block", marginBottom: 24, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: "#5C594F", textDecoration: "none" }}>← BACK</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#888", marginBottom: 32 }}>Last updated: {updated}</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>What we collect</h2>
      <p>Cinqle collects only what is necessary to run the game:</p>
      <ul>
        <li><strong>Anonymous player key</strong> — a random UUID generated on your device and stored in local storage. It is never linked to your name, email, or any personal identifier.</li>
        <li><strong>Gameplay data</strong> — your guesses and results for Daily, Solo, and Rival games. This data is associated only with your anonymous player key.</li>
        <li><strong>Match data</strong> — when you play Rival mode, the words you and your opponent choose and your guesses are stored on our server for the duration of the match.</li>
      </ul>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>What we do not collect</h2>
      <ul>
        <li>Your name, email address, or any account information</li>
        <li>Location data</li>
        <li>Device identifiers (IDFA, IDFV, etc.)</li>
        <li>Any data from contacts, camera, microphone, or other device sensors</li>
      </ul>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>How data is stored</h2>
      <p>Game state and your anonymous player key are stored in your browser&apos;s local storage and never leave your device except as described above. Server-side match and stats data is stored in a Cloudflare D1 database in the United States.</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>Third-party services</h2>
      <p>Cinqle is served by <a href="https://www.cloudflare.com/privacypolicy/" style={{ color: "#0E7C86" }}>Cloudflare</a>, which may log standard request metadata (IP address, timestamp) per their own privacy policy. We do not use analytics services, advertising networks, or social SDKs.</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>Children</h2>
      <p>Cinqle does not knowingly collect any data from children under 13. The app contains no advertising and requires no account creation.</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>Changes</h2>
      <p>If this policy changes materially, the updated date above will reflect that. Continued use of the app constitutes acceptance of the updated policy.</p>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>Contact</h2>
      <p>Questions? Email <a href={`mailto:${contact}`} style={{ color: "#0E7C86" }}>{contact}</a>.</p>
    </div>
  );
}
