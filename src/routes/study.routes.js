const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const { apiLimiter } = require('../middleware/rateLimiter');
const studyController = require('../controllers/study.controller');

router.use(authenticateToken);
router.use(apiLimiter);

// Subjects (Studies)
router.get('/subjects', studyController.getSubjects);
router.post('/subjects', studyController.createSubject);
router.put('/subjects/:id', studyController.updateSubject);
router.delete('/subjects/:id', studyController.deleteSubject);

// Study Notes
router.get('/notes', studyController.getNotes);
router.get('/notes/:id', studyController.getNoteById);
router.post('/notes', studyController.createNote);
router.put('/notes/:id', studyController.updateNote);
router.patch('/notes/:id/pin', studyController.togglePinNote);
router.patch('/notes/:id/mastery', studyController.updateNoteMastery);
router.delete('/notes/:id', studyController.deleteNote);

// Natural Cloud TTS Stream Fallback
router.get('/tts', studyController.streamNaturalTts);

module.exports = router;

