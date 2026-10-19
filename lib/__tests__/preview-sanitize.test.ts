import { sanitizeHtml } from '../../app/api/applications/[id]/preview/route';

describe('preview route sanitizeHtml', () => {
  it('removes <script> elements', () => {
    const result = sanitizeHtml('<html><body><p>hi</p><script>alert(1)</script></body></html>');

    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<p>hi</p>');
  });

  it('strips on* event-handler attributes from every element', () => {
    const result = sanitizeHtml(
      '<html><body><img src="x" onerror="steal()"><th onmouseover="y()">Статус</th></body></html>'
    );

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('src="x"');
    expect(result).toContain('Статус');
  });

  it('leaves ordinary content and non-event attributes intact', () => {
    const result = sanitizeHtml('<html><body><a href="/foo" class="link">go</a></body></html>');

    expect(result).toContain('href="/foo"');
    expect(result).toContain('class="link"');
    expect(result).toContain('go');
  });
});
