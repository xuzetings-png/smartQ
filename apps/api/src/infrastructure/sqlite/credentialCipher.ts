import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getEncryptionKey(): Buffer {
  const encodedKey = process.env.SMARTQ_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(encodedKey)) {
    throw new Error('请在 .env.local 配置 64 位十六进制 SMARTQ_ENCRYPTION_KEY');
  }
  return Buffer.from(encodedKey, 'hex');
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(ciphertext: string, iv: string, tag: string) {
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
