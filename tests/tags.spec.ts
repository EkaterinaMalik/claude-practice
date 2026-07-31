import { test, expect } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { TagsApi } from '../support/api/TagsApi';

test.describe('Tags', () => {
  test('GET /api/tags — returns array of tag strings', async ({ request }) => {
    const { status, tags } = await new TagsApi(request).getAll();

    expect(status).toBe(200);
    expect(Array.isArray(tags)).toBe(true);
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
    for (const article of articles) {
      expect(article.tagList).toContain(tag);
    }
  });
});
