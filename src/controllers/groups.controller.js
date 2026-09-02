const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getGroups(req, res, next) {
  try {
    const userId = req.user.id;

    const [groups, ungroupedCount, totalCount] = await Promise.all([
      prisma.group.findMany({
        where: { userId },
        include: {
          _count: {
            select: { secrets: true }
          }
        },
        orderBy: { name: 'asc' }
      }),
      prisma.secretItem.count({
        where: { userId, groupId: null }
      }),
      prisma.secretItem.count({
        where: { userId }
      })
    ]);

    const formattedGroups = groups.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon || 'folder',
      color: g.color || '#6366f1',
      count: g._count.secrets,
      createdAt: g.createdAt
    }));

    return res.json({
      groups: formattedGroups,
      ungroupedCount,
      totalCount
    });
  } catch (err) {
    next(err);
  }
}

async function createGroup(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, icon, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    const trimmedName = name.trim();

    const existing = await prisma.group.findFirst({
      where: { userId, name: trimmedName }
    });

    if (existing) {
      return res.status(409).json({ error: 'A group with this name already exists.' });
    }

    const newGroup = await prisma.group.create({
      data: {
        userId,
        name: trimmedName,
        icon: icon || 'folder',
        color: color || '#6366f1'
      }
    });

    return res.status(201).json({
      message: 'Group created successfully.',
      group: {
        id: newGroup.id,
        name: newGroup.name,
        icon: newGroup.icon,
        color: newGroup.color,
        count: 0
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateGroup(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, icon, color } = req.body;

    const existing = await prisma.group.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    const data = {};
    if (name && name.trim()) data.name = name.trim();
    if (icon) data.icon = icon;
    if (color) data.color = color;

    const updated = await prisma.group.update({
      where: { id },
      data
    });

    return res.json({
      message: 'Group updated successfully.',
      group: updated
    });
  } catch (err) {
    next(err);
  }
}

async function deleteGroup(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.group.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Deleting group automatically unlinks secret items to groupId = null due to onDelete: SetNull
    await prisma.group.delete({
      where: { id }
    });

    return res.json({
      message: 'Group deleted successfully. Associated secrets have been moved to Ungrouped.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup
};
