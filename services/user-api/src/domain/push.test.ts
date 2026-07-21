import { createHash } from 'node:crypto';
import { pushEndpointId } from './push';

describe('pushEndpointId', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

  it('sha256(endpoint) hex 앞 16자', () => {
    const full = createHash('sha256').update(endpoint).digest('hex');
    const id = pushEndpointId(endpoint);
    expect(id).toBe(full.slice(0, 16));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('결정적이며 endpoint별로 다르다', () => {
    expect(pushEndpointId(endpoint)).toBe(pushEndpointId(endpoint));
    expect(pushEndpointId(endpoint)).not.toBe(pushEndpointId(`${endpoint}x`));
  });
});
