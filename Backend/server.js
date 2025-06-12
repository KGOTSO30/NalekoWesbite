require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const multer = require('multer'); // Middleware for handling multipart/form-data
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs'); // Node.js File System module (not strictly needed for memory storage, but common)
const cors = require('cors'); // To handle CORS issues from your frontend
const stream = require('stream');

const app = express();
const port = process.env.PORT || 3000; // Use port from .env or default to 3000

// --- CORS Configuration ---
// Allow requests from your frontend's origin
// IMPORTANT: Replace 'http://127.0.0.1:5500' with the EXACT URL your frontend is served from.
// If you're using Live Server, it's typically http://127.0.0.1:5500 or http://localhost:5500.
// Add all possible origins your frontend might run on.
const corsOptions = {
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', `http://localhost:${port}`],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // Allow cookies to be sent (though not strictly necessary for this upload)
  optionsSuccessStatus: 204 // For pre-flight requests
};
app.use(cors(corsOptions));
app.use(express.json()); // For parsing application/json

// --- Multer Storage Setup ---
// Use memory storage for Multer as files will be directly streamed to Google Drive
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB file size limit (adjust as needed)
  },
  fileFilter: (req, file, cb) => {
    // Optional: Filter file types to only allow common document/resume formats
    const allowedTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX are allowed.'), false);
    }
  }
});

// --- Google Drive API Setup ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set the refresh token (obtained once manually from get-token.js)
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// Create a Google Drive service instance
const drive = google.drive({
  version: 'v3',
  auth: oauth2Client
});

// --- File Upload Endpoint ---
// 'resumeFile' is the name of the input field in your HTML form
app.post('/upload-resume', upload.single('resumeFile'), async (req, res) => {
  // Check if a file was actually uploaded
  if (!req.file) {
    console.error('No file uploaded or invalid file type.');
    return res.status(400).json({
      message: 'No file uploaded or invalid file type.'
    });
  }

  const { originalname, mimetype, buffer } = req.file;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // Basic validation for folder ID
  if (!folderId) {
    console.error('GOOGLE_DRIVE_FOLDER_ID is not set in .env');
    return res.status(500).json({
      message: 'Server configuration error: Google Drive folder ID is missing.'
    });
  }

  try {
    const fileMetadata = {
      name: originalname,
      parents: [folderId] // Upload to the specified folder
    };

    const media = {
      mimeType: mimetype,
      body: stream.Readable.from(buffer) // Multer's memoryStorage gives us the file content as a buffer
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink' // Request specific fields in the response
    });

    console.log('File uploaded to Google Drive:', response.data.name, response.data.id);
    res.status(200).json({
      message: 'Resume uploaded successfully!',
      fileId: response.data.id,
      fileName: response.data.name,
      webViewLink: response.data.webViewLink
    });

  } catch (error) {
    console.error('Error uploading resume to Google Drive:', error.message);
    // Provide more specific error details in development/debugging
    if (error.code === 401) {
      console.error('Authentication error. Check refresh token and client credentials.');
    } else if (error.errors && error.errors[0] && error.errors[0].reason === 'notFound') {
        console.error('Drive API Error: Folder ID might be incorrect or permissions insufficient.');
    }

    res.status(500).json({
      message: 'Failed to upload resume to Google Drive. ' + (error.errors ? error.errors[0].message : error.message),
      errorDetails: error.errors ? error.errors : error.message
    });
  }
});

// --- Start the Server ---
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Ensure your frontend is served from an allowed origin listed in corsOptions.origin`);
});