const multer = require("multer");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const talentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 2
    },
    fileFilter: (req, file, cb) => {
        const hasValidExt = /\.(pdf|docx)$/i.test(file.originalname);
        if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !hasValidExt) {
            return cb(new Error("Only PDF and DOCX files up to 5 MB are allowed."));
        }
        cb(null, true);
    }
});

const handleTalentFiles = talentUpload.fields([
    { name: "cv", maxCount: 1 },
    { name: "supporting", maxCount: 1 }
]);

function uploadErrorHandler(error, req, res, next) {
    if (
        error instanceof multer.MulterError ||
        error?.message?.includes("PDF and DOCX")
    ) {
        return res.status(400).json({
            success: false,
            message:
                error.code === "LIMIT_FILE_SIZE"
                    ? "Each uploaded file must be 5 MB or smaller."
                    : error.message
        });
    }
    next(error);
}

module.exports = {
    handleTalentFiles,
    uploadErrorHandler
};
