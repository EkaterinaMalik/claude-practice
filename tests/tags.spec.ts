import { test, expect } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { TagsApi } from '../support/api/TagsApi';

test.describe('Tags', () => {
  test('GET /api/tags — returns array of tag strings', async ({ request }) => {
    const { status, tags } = await new TagsApi(request).getAll();

    expect(status).toBe(200);
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length, 'no tags returned — the type check below would pass vacuously')
      .toBeGreaterThan(0);
    for (const t of tags) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  test('GET /api/tags — returns non-empty list', async ({ request }) => {
    const { tags } = await new TagsApi(request).getAll();
    expect(tags.length).toBeGreaterThan(0);
  });

  test('GET /api/tags — filtering articles by a global tag returns only matching articles', async ({ request }) => {
    const { tags } = await new TagsApi(request).getAll();
    const tag = tags[0];

    const { status, articles } = await new ArticlesApi(request).getAll({ tag, limit: 5 });

    expect(status).toBe(200);
    // Depends on the server's seed data: this filter only returns pre-seeded articles,
    // never ones the suite creates. If it returns nothing the loop proves nothing, so
    // fail loudly rather than pass silently.
    expect(articles.length, `no articles carry the tag "${tag}" — seed data may have changed`)
      .toBeGreaterThan(0);
    for (const article of articles) {
      expect(article.tagList).toContain(tag);
    }
  });
});
