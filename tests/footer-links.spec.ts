import { test, expect, type Locator } from '@playwright/test';

/** 監視対象の予約サイト */
const BOOKING_URL = 'https://app.satoyama-travel.com/booking/TMJYB/jinya/plans?s';

/**
 * 死活監視するフッターリンク
 * - name: フッター上のリンクテキスト
 * - expectedUrl: リダイレクト後に最終的に到達すべき URL
 *   (元湯陣屋・ご利用規約・プライバシーポリシーはフッターの href からリダイレクトされる)
 */
const FOOTER_LINKS = [
  { name: '元湯陣屋', expectedUrl: 'https://jinya-inn.com/tsurumaki/' },
  { name: 'よくある質問', expectedUrl: 'https://app.satoyama-travel.com/booking/TMJYB/faq' },
  { name: '里山トラベル', expectedUrl: 'https://satoyama-travel.jp/' },
  { name: 'ご利用規約', expectedUrl: 'https://satoyama-travel.jp/accommodationpolicy/' },
  { name: 'プライバシーポリシー', expectedUrl: 'https://www.jinya-connect.com/corp/privacy/' },
] as const;

/** 末尾スラッシュ・クエリ・ハッシュの差異を無視して URL を比較する */
const normalize = (url: string) => {
  const u = new URL(url);
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
};

function footerLink(footer: Locator, name: string) {
  return footer.getByRole('link', { name, exact: true });
}

test.describe('予約サイト フッターリンク死活監視', () => {
  test('予約サイト自体が表示され、フッターに全リンクが存在する', async ({ page }) => {
    const res = await page.goto(BOOKING_URL, { waitUntil: 'domcontentloaded' });
    expect(res, '予約サイトのレスポンスが取得できない').not.toBeNull();
    expect(res!.status(), `予約サイトのステータス: ${res!.status()}`).toBe(200);

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    for (const { name } of FOOTER_LINKS) {
      const link = footerLink(footer, name);
      await expect(link, `フッターに「${name}」リンクがない`).toBeVisible();
      await expect(link).toHaveAttribute('href', /.+/);
    }
  });

  for (const { name, expectedUrl } of FOOTER_LINKS) {
    test(`フッターリンク「${name}」のリンク先が生きている`, async ({ page }) => {
      await page.goto(BOOKING_URL, { waitUntil: 'domcontentloaded' });

      // フッター上の実際の href を取得 (相対パスは絶対 URL に解決)
      const link = footerLink(page.locator('footer'), name);
      await expect(link, `フッターに「${name}」リンクがない`).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href, `「${name}」の href が空`).toBeTruthy();
      const targetUrl = new URL(href!, page.url()).toString();

      // 実ブラウザでリンク先を開き、HTTP ステータスと最終到達 URL を検証
      const target = await page.context().newPage();
      const res = await target.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      expect(res, `「${name}」(${targetUrl}) のレスポンスが取得できない`).not.toBeNull();

      const status = res!.status();
      expect(status, `「${name}」(${targetUrl}) のステータス: ${status}`).toBe(200);
      expect(
        normalize(target.url()),
        `「${name}」の最終到達 URL が想定と異なる (href: ${targetUrl})`,
      ).toBe(normalize(expectedUrl));

      // エラーページを 200 で返すケースを検知するため、本文とタイトルの存在も確認
      await expect(target.locator('body')).not.toBeEmpty();
      expect((await target.title()).trim(), `「${name}」のページタイトルが空`).not.toBe('');

      await target.close();
    });
  }
});
