const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '..', 'uploads');
const proofDir = path.join(uploadRoot, 'proofs');

fs.mkdirSync(proofDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, safeExt)
      .replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${Date.now()}-${baseName}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const allowedMimeTypes = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // Audio
  'audio/mpeg',       // .mp3
  'audio/wav',        // .wav
  'audio/ogg',        // .ogg
  'audio/mp4',        // .m4a
  'audio/aac',        // .aac
  'audio/flac',       // .flac
  'audio/x-wav',      // alternative wav MIME
  // Documents
  'application/pdf',
]);

const uploadProof = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Proof must be an image, video, audio recording, or PDF document'));
    }

    cb(null, true);
  },
});

module.exports = { uploadProof, proofDir, uploadRoot };
