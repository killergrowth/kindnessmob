/**
 * Cloudflare Pages Function — /robots.txt
 * Blocks crawlers on *.pages.dev preview URLs.
 * Passes through to the static robots.txt on the live domain.
 */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.hostname.endsWith('.pages.dev')) {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  // Live domain — serve static robots.txt
  return env.ASSETS.fetch(request);
}
