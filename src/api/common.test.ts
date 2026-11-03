import { describe, it, expect } from 'vitest';
import { decodeHTMLEntities, stripHtml } from './common.js';

describe('decodeHTMLEntities', () => {
  it('decodes numeric, hex and common named entities', () => {
    expect(decodeHTMLEntities('It&#8217;s &#x1F680; &#39;x&#39;')).toBe('It’s \u{1F680} \'x\'');
    expect(decodeHTMLEntities('a &mdash; b &ndash; c &hellip;')).toBe('a — b – c …');
    expect(decodeHTMLEntities('&ldquo;q&rdquo; &lsquo;s&rsquo;')).toBe('“q” ‘s’');
    expect(decodeHTMLEntities('&copy;&reg;&trade;&euro;&bull;&middot;')).toBe('©®™€•·');
    expect(decodeHTMLEntities('a&nbsp;b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe('a b <c> "d" \'e\'');
  });

  it('decodes &amp; last, so escaped entities stay escaped once', () => {
    expect(decodeHTMLEntities('&amp;lt;b&amp;gt; &amp;#39; R&amp;D')).toBe('&lt;b&gt; &#39; R&D');
  });

  it('leaves unknown entities and invalid code points alone', () => {
    expect(decodeHTMLEntities('&foo; &#99999999;')).toBe('&foo; ');
    expect(decodeHTMLEntities('')).toBe('');
  });
});

describe('stripHtml', () => {
  it('turns markup into readable plain text', () => {
    const html =
      '<p>Hello&nbsp;world</p><script>alert(1)</script><ul><li>One</li><li class="x">Two</li></ul>Line<br/>break';
    expect(stripHtml(html)).toBe('Hello world\n• One\n• Two\nLine\nbreak');
  });

  it('does not treat <link> as a list item', () => {
    expect(stripHtml('<link rel="stylesheet" href="x.css">Text')).toBe('Text');
  });

  it('collapses runs of blank lines', () => {
    expect(stripHtml('<p>a</p>\n\n\n<p>b</p>')).toBe('a\n\nb');
  });
});
