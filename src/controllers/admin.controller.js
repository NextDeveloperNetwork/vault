const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getAllUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        _count: {
          select: { secrets: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function approveUser(req, res, next) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status: 'APPROVED' },
      select: { id: true, email: true, status: true }
    });

    return res.json({ message: `Account ${updated.email} approved!`, user: updated });
  } catch (err) {
    next(err);
  }
}

async function rejectUser(req, res, next) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status: 'REJECTED' },
      select: { id: true, email: true, status: true }
    });

    return res.json({ message: `Account ${updated.email} rejected.`, user: updated });
  } catch (err) {
    next(err);
  }
}

async function changeRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be ADMIN or USER.' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true }
    });

    return res.json({ message: `User ${updated.email} role updated to ${updated.role}`, user: updated });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await prisma.user.delete({ where: { id } });

    return res.json({ message: `User account deleted.` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllUsers,
  approveUser,
  rejectUser,
  changeRole,
  deleteUser
};
