import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './user-agent.ts';

describe('разбор User-Agent', () => {
  const cases: Array<[string, string, string]> = [
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome',
      'Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Safari',
      'macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Safari',
      'iPhone',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome',
      'Linux',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Firefox',
      'Windows',
    ],
  ];

  it.each(cases)('разбирает %s', (ua, browser, os) => {
    const parsed = parseUserAgent(ua);
    expect(parsed.browser).toBe(browser);
    expect(parsed.os).toBe(os);
    expect(parsed.device).toBe(`${browser} на ${os}`);
  });

  it('Edge не определяется как Chrome, хотя содержит Chrome в строке', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
    expect(parseUserAgent(ua).browser).toBe('Edge');
  });

  it('Chrome на iOS (CriOS) не определяется как Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
    expect(parseUserAgent(ua).browser).toBe('Chrome');
  });

  it('не падает на пустом и отсутствующем значении', () => {
    expect(parseUserAgent(undefined).device).toBe('Неизвестное устройство');
    expect(parseUserAgent(null).device).toBe('Неизвестное устройство');
    expect(parseUserAgent('').device).toBe('Неизвестное устройство');
    expect(parseUserAgent('curl/8.6.0').device).toBe('Неизвестное устройство');
  });
});
