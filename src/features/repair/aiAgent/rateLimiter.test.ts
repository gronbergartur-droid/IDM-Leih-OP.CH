import { describe, expect, it } from 'vitest';
import { IDM_AI_AGENT_RATE_LIMIT, isRateLimited } from './rateLimiter';

describe('isRateLimited', () => {
  it('allows requests below the threshold', () => {
    expect(isRateLimited(0)).toBe(false);
    expect(isRateLimited(IDM_AI_AGENT_RATE_LIMIT.maxRequests - 1)).toBe(false);
  });

  it('blocks once the threshold is reached', () => {
    expect(isRateLimited(IDM_AI_AGENT_RATE_LIMIT.maxRequests)).toBe(true);
  });

  it('blocks above the threshold', () => {
    expect(isRateLimited(IDM_AI_AGENT_RATE_LIMIT.maxRequests + 5)).toBe(true);
  });
});
