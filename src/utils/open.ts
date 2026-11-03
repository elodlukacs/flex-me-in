/**
 * Job URLs come from third-party feeds. Handing them to the OS opener as-is
 * would launch whatever is registered for `file:`, custom schemes or bare
 * paths, so anything but a well-formed http(s) URL is refused.
 */
export async function openUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing to open a ${parsed.protocol} URL`);
  }
  const { default: open } = await import('open');
  await open(parsed.href);
}
