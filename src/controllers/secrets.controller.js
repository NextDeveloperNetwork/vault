const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { encrypt, decrypt } = require('../utils/crypto');

async function getAllSecrets(req, res, next) {
  try {
    const userId = req.user.id;
    const { category, favorite, search } = req.query;

    const where = { userId };

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (favorite === 'true') {
      where.favorite = true;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { websiteUrl: { contains: search, mode: 'insensitive' } },
        { tags: { contains: search, mode: 'insensitive' } }
      ];
    }

    const secrets = await prisma.secretItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    // Decrypt payload for each secret before responding
    const decryptedSecrets = secrets.map(item => {
      let payload = {};
      try {
        payload = decrypt(item.encryptedPayload, item.iv, item.authTag);
      } catch (err) {
        console.error(`Failed to decrypt secret ${item.id}:`, err.message);
        payload = { error: 'Decryption failed' };
      }

      return {
        id: item.id,
        title: item.title,
        category: item.category,
        username: item.username,
        websiteUrl: item.websiteUrl,
        favorite: item.favorite,
        tags: item.tags ? item.tags.split(',').map(t => t.trim()) : [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        payload // Sensitives: password, connectionString, notes, host, port, dbName, apiKey, etc.
      };
    });

    return res.json({ secrets: decryptedSecrets });
  } catch (err) {
    next(err);
  }
}

async function getSecretById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const secret = await prisma.secretItem.findFirst({
      where: { id, userId }
    });

    if (!secret) {
      return res.status(44.0).json({ error: 'Secret not found.' });
    }

    const payload = decrypt(secret.encryptedPayload, secret.iv, secret.authTag);

    return res.json({
      secret: {
        id: secret.id,
        title: secret.title,
        category: secret.category,
        username: secret.username,
        websiteUrl: secret.websiteUrl,
        favorite: secret.favorite,
        tags: secret.tags ? secret.tags.split(',').map(t => t.trim()) : [],
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
        payload
      }
    });
  } catch (err) {
    next(err);
  }
}

async function createSecret(req, res, next) {
  try {
    const userId = req.user.id;
    const { title, category, username, websiteUrl, favorite, tags, payload } = req.body;

    if (!title || !payload) {
      return res.status(400).json({ error: 'Title and secret payload are required.' });
    }

    // Encrypt the payload object
    const { encryptedPayload, iv, authTag } = encrypt(payload);

    const secret = await prisma.secretItem.create({
      data: {
        userId,
        title,
        category: category || 'PASSWORD',
        username: username || null,
        websiteUrl: websiteUrl || null,
        favorite: Boolean(favorite),
        tags: Array.isArray(tags) ? tags.join(',') : (tags || null),
        encryptedPayload,
        iv,
        authTag
      }
    });

    return res.status(201).json({
      message: 'Secret saved securely.',
      secretId: secret.id
    });
  } catch (err) {
    next(err);
  }
}

async function updateSecret(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, category, username, websiteUrl, favorite, tags, payload } = req.body;

    const existing = await prisma.secretItem.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Secret not found.' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (category !== undefined) updateData.category = category;
    if (username !== undefined) updateData.username = username;
    if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl;
    if (favorite !== undefined) updateData.favorite = Boolean(favorite);
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.join(',') : tags;

    if (payload) {
      const { encryptedPayload, iv, authTag } = encrypt(payload);
      updateData.encryptedPayload = encryptedPayload;
      updateData.iv = iv;
      updateData.authTag = authTag;
    }

    const updated = await prisma.secretItem.update({
      where: { id },
      data: updateData
    });

    return res.json({
      message: 'Secret updated successfully.',
      secretId: updated.id
    });
  } catch (err) {
    next(err);
  }
}

async function deleteSecret(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.secretItem.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Secret not found.' });
    }

    await prisma.secretItem.delete({
      where: { id }
    });

    return res.json({ message: 'Secret deleted permanently.' });
  } catch (err) {
    next(err);
  }
}

async function toggleFavorite(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.secretItem.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Secret not found.' });
    }

    const updated = await prisma.secretItem.update({
      where: { id },
      data: { favorite: !existing.favorite }
    });

    return res.json({
      favorite: updated.favorite,
      message: updated.favorite ? 'Added to favorites' : 'Removed from favorites'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllSecrets,
  getSecretById,
  createSecret,
  updateSecret,
  deleteSecret,
  toggleFavorite
};
