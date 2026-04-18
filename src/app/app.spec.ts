import { describe, expect, it } from 'vitest';

describe('App', () => {
  it('module loads', async () => {
    const mod = await import('./app');
    expect(mod.App).toBeDefined();
  });
});
