import { describe, it, expect, vi, beforeEach } from 'vitest';

const openMock = vi.fn(async () => undefined);
vi.mock('open', () => ({ default: openMock }));

const { openUrl } = await import('./open.js');

describe('openUrl', () => {
  beforeEach(() => openMock.mockClear());

  it.each(['https://example.com/jobs/1', 'http://example.com/a?b=c'])('opens %s', async (url) => {
    await openUrl(url);
    expect(openMock).toHaveBeenCalledWith(url);
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'vscode://extension/evil',
    'ssh://host',
    'data:text/html,hi',
  ])('rejects %s', async (url) => {
    await expect(openUrl(url)).rejects.toThrow(Error);
    expect(openMock).not.toHaveBeenCalled();
  });

  it.each(['/Applications/Calculator.app', 'not a url', ''])('rejects non-URL %s', async (url) => {
    await expect(openUrl(url)).rejects.toThrow('Not a valid URL');
    expect(openMock).not.toHaveBeenCalled();
  });
});
