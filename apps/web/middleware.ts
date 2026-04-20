import { geolocation, rewrite } from "@vercel/edge";

export const config = {
  // Apply to app routes, skip internal Vercel paths and static assets.
  matcher: "/((?!api|_next|.*\\..*).*)",
};

/**
 * Keeping Synapse out of GDPR/ePrivacy/Impressum scope until v2 sets up
 * an Art. 27 representative and cookie consent banner.
 */
const BLOCKED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA (non-EU)
  "IS", "LI", "NO",
  // UK + CH
  "GB", "CH",
]);

const BLOCKED_BODY = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Synapse — Not available</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #f5f0e8;
      color: #2c2418;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    main { max-width: 480px; padding: 2rem; text-align: center; }
    h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem; }
    p { line-height: 1.6; color: #6b5e4f; margin: 0 0 0.75rem; }
    a { color: #8b5e3c; text-decoration: underline; }
    @media (prefers-color-scheme: dark) {
      body { background: #1c1a16; color: #e8dfd4; }
      p { color: #a89880; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Synapse is not available in your region</h1>
    <p>We currently don't offer service in the European Economic Area or United Kingdom.</p>
    <p>Questions? <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a></p>
  </main>
</body>
</html>`;

export default function middleware(request: Request): Response {
  const { country } = geolocation(request);
  if (country && BLOCKED_COUNTRIES.has(country)) {
    return new Response(BLOCKED_BODY, {
      status: 451,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  // SPA fallback: React Router handles the path client-side.
  // vercel.json rewrites don't run after middleware matches, so do it here.
  return rewrite(new URL("/index.html", request.url));
}
