const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// Derive 32-byte key from master secret string
function getMasterKey() {
  const secret = process.env.VAULT_MASTER_KEY || 'default_passkeeper_master_vault_key_32_bytes_long';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt sensitive object or text payload using AES-256-GCM
 * @param {object|string} data 
 * @returns {{ encryptedPayload: string, iv: string, authTag: string }}
 */
function encrypt(data) {
  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const key = getMasterKey();
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedPayload: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag
  };
}

/**
 * Decrypt payload using AES-256-GCM
 * @param {string} encryptedHex 
 * @param {string} ivHex 
 * @param {string} authTagHex 
 * @returns {object|string}
 */
function decrypt(encryptedHex, ivHex, authTagHex) {
  try {
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    console.error('Decryption error:', err.message);
    throw new Error('Failed to decrypt secret payload. Key or data modified.');
  }
}

module.exports = {
  encrypt,
  decrypt
};
