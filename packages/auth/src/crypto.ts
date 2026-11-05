import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export function credentials(keys: { pepper: Buffer; encryption: Readonly<Record<string, Buffer>>; currentKeyId: string; lookup: Buffer }) {
  if (!keys || !Buffer.isBuffer(keys.pepper) || !Buffer.isBuffer(keys.lookup) || keys.pepper.length !== 32 || keys.lookup.length !== 32 || typeof keys.currentKeyId !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(keys.currentKeyId) || !keys.encryption || !Object.hasOwn(keys.encryption, keys.currentKeyId) || Object.entries(keys.encryption).some(([id, key]) => !/^[a-zA-Z0-9_-]{1,32}$/.test(id) || !Buffer.isBuffer(key) || key.length !== 32)) throw new Error('Invalid auth keys');
  keys = { ...keys, pepper: Buffer.from(keys.pepper), lookup: Buffer.from(keys.lookup), encryption: Object.fromEntries(Object.entries(keys.encryption).map(([id, key]) => [id, Buffer.from(key)])) };
  return {
    otpHash: (otp: string) => { if (!/^\d{6}$/.test(otp)) throw new Error('Invalid OTP'); return createHmac('sha256', createHmac('sha256', keys.lookup).update('echoes:otp:v1').digest()).update(otp).digest('base64url'); },
    token: () => randomBytes(32).toString('base64url'),
    tokenHash: (token: string) => createHash('sha256').update(token).update(keys.pepper).digest(),
    emailHash: (email: string) => createHmac('sha256', keys.lookup).update(email.trim().toLowerCase()).digest(),
    encrypt(email: string) {
      const keyId = Buffer.from(keys.currentKeyId);
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keys.encryption[keys.currentKeyId]!, nonce);
      cipher.setAAD(Buffer.from(`echoes:users.email:v1:${keys.currentKeyId}`));
      const text = Buffer.concat([cipher.update(email.trim().toLowerCase(), 'utf8'), cipher.final()]);
      return Buffer.concat([Buffer.from([keyId.length]), keyId, nonce, cipher.getAuthTag(), text]);
    },
    decrypt(value: Buffer) {
      const length = value[0];
      if (!length || length > 32 || value.length < 29 + length) throw new Error('Invalid encrypted email');
      const id = value.subarray(1, 1 + length).toString();
      const key = keys.encryption[id];
      if (!Object.hasOwn(keys.encryption, id) || !Buffer.isBuffer(key)) throw new Error('Unknown encryption key');
      const start = 1 + length;
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(start, start + 12));
      cipher.setAAD(Buffer.from(`echoes:users.email:v1:${id}`));
      cipher.setAuthTag(value.subarray(start + 12, start + 28));
      return Buffer.concat([cipher.update(value.subarray(start + 28)), cipher.final()]).toString('utf8');
    },
  };
}
