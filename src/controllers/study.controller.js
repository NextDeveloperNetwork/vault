const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseJsonSafe(raw, fallback = []) {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatNote(note) {
  return {
    id: note.id,
    subjectId: note.subjectId,
    subject: note.subject || null,
    chapter: note.chapter || '',
    title: note.title,
    summary: note.summary || '',
    content: note.content || '',
    takeaways: parseJsonSafe(note.takeaways, []),
    resources: parseJsonSafe(note.resources, []),
    tags: note.tags ? note.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    mastery: note.mastery || 'LEARNING',
    pinned: Boolean(note.pinned),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

// ======================================================
// SUBJECTS (STUDIES / COURSES / NOTEBOOKS)
// ======================================================
async function getSubjects(req, res, next) {
  try {
    const userId = req.user.id;

    const [subjects, allNotes] = await Promise.all([
      prisma.studySubject.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.studyNote.findMany({
        where: { userId },
        select: {
          id: true,
          subjectId: true,
          mastery: true,
          pinned: true,
          tags: true,
          takeaways: true
        }
      })
    ]);

    const masteryCounts = { NEW: 0, LEARNING: 0, REVIEW: 0, MASTERED: 0 };
    const subjectStats = {};
    let unassignedCount = 0;
    let pinnedCount = 0;
    let totalFlashcards = 0;
    const tagSet = new Set();

    allNotes.forEach(n => {
      const m = n.mastery || 'LEARNING';
      if (masteryCounts[m] !== undefined) masteryCounts[m]++;
      if (n.pinned) pinnedCount++;

      const cards = parseJsonSafe(n.takeaways, []);
      totalFlashcards += cards.length;

      if (n.tags) {
        n.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
      }

      if (!n.subjectId) {
        unassignedCount++;
      } else {
        if (!subjectStats[n.subjectId]) {
          subjectStats[n.subjectId] = { total: 0, mastered: 0, review: 0, learning: 0, flashcards: 0 };
        }
        subjectStats[n.subjectId].total++;
        subjectStats[n.subjectId].flashcards += cards.length;
        if (m === 'MASTERED') subjectStats[n.subjectId].mastered++;
        else if (m === 'REVIEW') subjectStats[n.subjectId].review++;
        else subjectStats[n.subjectId].learning++;
      }
    });

    const formattedSubjects = subjects.map(s => {
      const st = subjectStats[s.id] || { total: 0, mastered: 0, review: 0, learning: 0, flashcards: 0 };
      const progress = st.total > 0 ? Math.round((st.mastered / st.total) * 100) : 0;
      return {
        id: s.id,
        name: s.name,
        description: s.description || '',
        icon: s.icon || 'book-open',
        color: s.color || '#4f46e5',
        status: s.status || 'ACTIVE',
        noteCount: st.total,
        masteredCount: st.mastered,
        reviewCount: st.review,
        flashcardCount: st.flashcards,
        progress,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      };
    });

    return res.json({
      subjects: formattedSubjects,
      totalSubjects: subjects.length,
      totalNotes: allNotes.length,
      pinnedCount,
      unassignedCount,
      totalFlashcards,
      masteryCounts,
      tags: Array.from(tagSet)
    });
  } catch (err) {
    next(err);
  }
}

async function createSubject(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, description, icon, color, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Study subject name is required.' });
    }

    const trimmedName = name.trim();
    const existing = await prisma.studySubject.findFirst({
      where: { userId, name: trimmedName }
    });

    if (existing) {
      return res.status(409).json({ error: 'A study subject with this name already exists.' });
    }

    const subject = await prisma.studySubject.create({
      data: {
        userId,
        name: trimmedName,
        description: description ? description.trim() : null,
        icon: icon || 'book-open',
        color: color || '#4f46e5',
        status: status || 'ACTIVE'
      }
    });

    return res.status(201).json({
      message: 'Study created successfully.',
      subject: {
        ...subject,
        noteCount: 0,
        masteredCount: 0,
        reviewCount: 0,
        flashcardCount: 0,
        progress: 0
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateSubject(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, description, icon, color, status } = req.body;

    const existing = await prisma.studySubject.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Study subject not found.' });
    }

    const data = {};
    if (name !== undefined && name.trim()) data.name = name.trim();
    if (description !== undefined) data.description = description ? description.trim() : null;
    if (icon !== undefined) data.icon = icon;
    if (color !== undefined) data.color = color;
    if (status !== undefined) data.status = status;

    const updated = await prisma.studySubject.update({
      where: { id },
      data
    });

    return res.json({
      message: 'Study updated successfully.',
      subject: updated
    });
  } catch (err) {
    next(err);
  }
}

async function deleteSubject(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.studySubject.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Study subject not found.' });
    }

    await prisma.studySubject.delete({
      where: { id }
    });

    return res.json({
      message: 'Study deleted. Its notes were kept in General Notes.'
    });
  } catch (err) {
    next(err);
  }
}

// ======================================================
// STUDY NOTES
// ======================================================
async function getNotes(req, res, next) {
  try {
    const userId = req.user.id;
    const { subjectId, mastery, pinned, search, tag } = req.query;

    const where = { userId };

    if (subjectId === 'NONE' || subjectId === 'none') {
      where.subjectId = null;
    } else if (subjectId && subjectId !== 'ALL') {
      where.subjectId = subjectId;
    }

    if (mastery && mastery !== 'ALL') {
      where.mastery = mastery;
    }

    if (pinned === 'true') {
      where.pinned = true;
    }

    if (tag && tag !== 'ALL') {
      where.tags = { contains: tag, mode: 'insensitive' };
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
        { tags: { contains: q, mode: 'insensitive' } }
      ];
    }

    const notes = await prisma.studyNote.findMany({
      where,
      include: {
        subject: {
          select: { id: true, name: true, icon: true, color: true, status: true }
        }
      },
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    return res.json({
      notes: notes.map(formatNote)
    });
  } catch (err) {
    next(err);
  }
}

async function getNoteById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const note = await prisma.studyNote.findFirst({
      where: { id, userId },
      include: {
        subject: {
          select: { id: true, name: true, icon: true, color: true, status: true }
        }
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Study note not found.' });
    }

    return res.json({ note: formatNote(note) });
  } catch (err) {
    next(err);
  }
}

async function createNote(req, res, next) {
  try {
    const userId = req.user.id;
    const { title, subjectId, chapter, summary, content, takeaways, resources, tags, mastery, pinned } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Note title is required.' });
    }

    const note = await prisma.studyNote.create({
      data: {
        userId,
        subjectId: subjectId || null,
        chapter: chapter ? chapter.trim() : null,
        title: title.trim(),
        summary: summary ? summary.trim() : null,
        content: content || '',
        takeaways: Array.isArray(takeaways) ? JSON.stringify(takeaways) : (takeaways || null),
        resources: Array.isArray(resources) ? JSON.stringify(resources) : (resources || null),
        tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean).join(',') : (tags || null),
        mastery: mastery || 'LEARNING',
        pinned: Boolean(pinned)
      },
      include: {
        subject: {
          select: { id: true, name: true, icon: true, color: true, status: true }
        }
      }
    });

    // Touch parent subject updatedAt
    if (note.subjectId) {
      await prisma.studySubject.updateMany({
        where: { id: note.subjectId, userId },
        data: { updatedAt: new Date() }
      });
    }

    return res.status(201).json({
      message: 'Study note saved!',
      note: formatNote(note)
    });
  } catch (err) {
    next(err);
  }
}

async function updateNote(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, subjectId, chapter, summary, content, takeaways, resources, tags, mastery, pinned } = req.body;

    const existing = await prisma.studyNote.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Study note not found.' });
    }

    const data = {};
    if (title !== undefined && title.trim()) data.title = title.trim();
    if (subjectId !== undefined) data.subjectId = subjectId || null;
    if (chapter !== undefined) data.chapter = chapter ? chapter.trim() : null;
    if (summary !== undefined) data.summary = summary ? summary.trim() : null;
    if (content !== undefined) data.content = content;
    if (takeaways !== undefined) {
      data.takeaways = Array.isArray(takeaways) ? JSON.stringify(takeaways) : (takeaways || null);
    }
    if (resources !== undefined) {
      data.resources = Array.isArray(resources) ? JSON.stringify(resources) : (resources || null);
    }
    if (tags !== undefined) {
      data.tags = Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean).join(',') : (tags || null);
    }
    if (mastery !== undefined) data.mastery = mastery;
    if (pinned !== undefined) data.pinned = Boolean(pinned);

    const updated = await prisma.studyNote.update({
      where: { id },
      data,
      include: {
        subject: {
          select: { id: true, name: true, icon: true, color: true, status: true }
        }
      }
    });

    if (updated.subjectId) {
      await prisma.studySubject.updateMany({
        where: { id: updated.subjectId, userId },
        data: { updatedAt: new Date() }
      });
    }

    return res.json({
      message: 'Note updated!',
      note: formatNote(updated)
    });
  } catch (err) {
    next(err);
  }
}

async function togglePinNote(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.studyNote.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Study note not found.' });
    }

    const updated = await prisma.studyNote.update({
      where: { id },
      data: { pinned: !existing.pinned }
    });

    return res.json({
      pinned: updated.pinned,
      message: updated.pinned ? 'Note pinned to top' : 'Note unpinned'
    });
  } catch (err) {
    next(err);
  }
}

async function updateNoteMastery(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { mastery } = req.body;

    const valid = ['NEW', 'LEARNING', 'REVIEW', 'MASTERED'];
    if (!valid.includes(mastery)) {
      return res.status(400).json({ error: 'Invalid mastery level.' });
    }

    const existing = await prisma.studyNote.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Study note not found.' });
    }

    const updated = await prisma.studyNote.update({
      where: { id },
      data: { mastery }
    });

    return res.json({
      mastery: updated.mastery,
      message: `Marked as ${mastery.toLowerCase()}`
    });
  } catch (err) {
    next(err);
  }
}

async function deleteNote(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await prisma.studyNote.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Study note not found.' });
    }

    await prisma.studyNote.delete({
      where: { id }
    });

    return res.json({ message: 'Study note deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  togglePinNote,
  updateNoteMastery,
  deleteNote
};

