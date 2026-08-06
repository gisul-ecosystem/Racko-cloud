import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/csv',
  'application/csv',
]);

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

const storage = multer.memoryStorage();

export const vmHostLeaseUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const hasAllowedExt = [...ALLOWED_EXTENSIONS].some((ext) => name.endsWith(ext));
    const mime = file.mimetype.toLowerCase();

    if (!hasAllowedExt && !ALLOWED_MIME_TYPES.has(mime)) {
      cb(new Error('Only Excel/CSV files are allowed (.xlsx, .xls, .csv).'));
      return;
    }
    cb(null, true);
  },
});
