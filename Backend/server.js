require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const multer = require('multer'); // Middleware for handling multipart/form-data
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs'); // Node.js File System module (not strictly needed for memory storage, but common)
const cors = require('cors'); // To handle CORS issues from your frontend
const stream = require('stream');
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000; // Use port from .env or default to 3000

// --- CORS Configuration ---
// Allow requests from your frontend's origin
// IMPORTANT: Replace 'http://127.0.0.1:5500' with the EXACT URL your frontend is served from.
// If you're using Live Server, it's typically http://127.0.0.1:5500 or http://localhost:5500.
// Add all possible origins your frontend might run on.
const corsOptions = {
    origin: [
        "http://127.0.0.1:5503",
        "http://localhost:5503",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://naleko.com",
        "https://www.naleko.com",
        "https://nalekowesbite-v2.onrender.com",
        "https://nalekowesbite.onrender.com"
    ],
    methods: [
        "GET",
        "HEAD",
        "PUT",
        "PATCH",
        "POST",
        "DELETE"
    ],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true }));

// --- Multer Storage Setup ---
// Use memory storage for Multer as files will be directly streamed to Google Drive
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 10 MB file size limit (adjust as needed)
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

// --- Salesforce Connection Storage ---

let oauthState = null;
let codeVerifier = null;

const salesforce = {
    accessToken: null,
    instanceUrl: null,
    refreshToken: null
};


// --- Salesforce Login ---

app.get("/login", (req, res) => {
    oauthState =
        crypto.randomBytes(32).toString("hex");

    codeVerifier =
        crypto.randomBytes(32).toString("base64url");

    const codeChallenge =
        crypto
            .createHash("sha256")
            .update(codeVerifier)
            .digest("base64url");

    const params = new URLSearchParams({
        response_type: "code",
        client_id:
            process.env.SALESFORCE_CLIENT_ID,
        redirect_uri:
            process.env.SALESFORCE_REDIRECT_URI,
        state:
            oauthState,
        code_challenge:
            codeChallenge,
        code_challenge_method:
            "S256",
        scope:
            "api refresh_token offline_access"
    });

    const authorizationUrl =
        `${process.env.SALESFORCE_LOGIN_URL}` +
        `/services/oauth2/authorize?${params.toString()}`;

    res.redirect(authorizationUrl);
});


// --- Salesforce OAuth Callback ---

app.get("/oauth/callback", async (req, res) => {
    const {
        code,
        state,
        error,
        error_description
    } = req.query;

    if (error) {
        return res.status(400).send(
            `Salesforce login failed: ${
                error_description || error
            }`
        );
    }

    if (!state || state !== oauthState) {
        return res.status(400).send(
            "Invalid Salesforce OAuth state."
        );
    }

    if (!code) {
        return res.status(400).send(
            "Salesforce did not return an authorization code."
        );
    }

    try {
        const tokenParams =
            new URLSearchParams();

        tokenParams.append(
            "grant_type",
            "authorization_code"
        );

        tokenParams.append("code", code);

        tokenParams.append(
            "client_id",
            process.env.SALESFORCE_CLIENT_ID
        );

        tokenParams.append(
            "client_secret",
            process.env.SALESFORCE_CLIENT_SECRET
        );

        tokenParams.append(
            "redirect_uri",
            process.env.SALESFORCE_REDIRECT_URI
        );

        tokenParams.append(
            "code_verifier",
            codeVerifier
        );

        const tokenResponse =
            await axios.post(
                `${process.env.SALESFORCE_LOGIN_URL}` +
                "/services/oauth2/token",
                tokenParams.toString(),
                {
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    }
                }
            );

        salesforce.accessToken =
            tokenResponse.data.access_token;

        salesforce.instanceUrl =
            tokenResponse.data.instance_url;

        salesforce.refreshToken =
            tokenResponse.data.refresh_token;

        return res.send(`
            <h1>Salesforce Connected</h1>
            <p>
                The Naleko website backend is now
                connected to Salesforce.
            </p>
            <p>
                You may return to the applicant form.
            </p>
        `);

    } catch (error) {
        console.error(
            "Salesforce OAuth error:",
            error.response?.data || error.message
        );

        return res.status(500).send(
            "Salesforce connection failed."
        );
    }
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
// --- Submit Applicant to Salesforce ---

app.post(
    "/apply",
    upload.single("cv"),
    async (req, res) => {
        if (
            !salesforce.accessToken ||
            !salesforce.instanceUrl
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Salesforce is not connected. Open http://localhost:3001/login first."
            });
        }

        try {
            const {
                firstName,
                lastName,
                email,
                phone,
                position
            } = req.body;

            if (
                !firstName ||
                !lastName ||
                !email ||
                !phone ||
                !position
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please complete all required fields."
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please upload your CV."
                });
            }

            const applicantResponse =
                await axios.post(
                    `${salesforce.instanceUrl}` +
                    "/services/data/v67.0/" +
                    "sobjects/Applicant__c/",
                    {
                        First_Name__c: firstName,
                        Last_Name__c: lastName,
                        Email__c: email,
                        Phone__c: phone,
                        Position__c: position
                    },
                    {
                        headers: {
                            Authorization:
                                `Bearer ${salesforce.accessToken}`,
                            "Content-Type":
                                "application/json"
                        }
                    }
                );

            const applicantId =
                applicantResponse.data.id;

            const fileName =
                req.file.originalname;

            const fileTitle =
                fileName.replace(/\.[^/.]+$/, "");

            const fileBase64 =
                req.file.buffer.toString("base64");

            const fileResponse =
                await axios.post(
                    `${salesforce.instanceUrl}` +
                    "/services/data/v67.0/" +
                    "sobjects/ContentVersion/",
                    {
                        Title: fileTitle,
                        PathOnClient: fileName,
                        VersionData: fileBase64,
                        FirstPublishLocationId:
                            applicantId
                    },
                    {
                        headers: {
                            Authorization:
                                `Bearer ${salesforce.accessToken}`,
                            "Content-Type":
                                "application/json"
                        }
                    }
                );

                // Retrieve the user-friendly Salesforce applicant number
const applicationReference =
    "NAL-APP-" +
    new Date().getFullYear() +
    "-" +
    applicantId.slice(-6).toUpperCase();

console.log(
    "Application reference:",
    applicationReference
);

    console.log(
    "Application reference:",
    applicationReference
);

return res.status(201).json({
    success: true,
    message:
        "Application submitted successfully.",
    applicantId: applicantId,
    applicationReference: applicationReference,
    contentVersionId: fileResponse.data.id
});

        } catch (error) {
            console.error(
                "Application submission error:",
                error.response?.data ||
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "The application could not be submitted.",
                error:
                    error.response?.data ||
                    error.message
            });
        }
    }
);

// Talent Community: CV and optional supporting document
const talentCommunityUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 2
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = new Set([
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ]);

        if (!allowedTypes.has(file.mimetype)) {
            return cb(
                new Error("Only PDF and DOCX documents are allowed.")
            );
        }

        cb(null, true);
    }
});

// Upload a document and connect it to a Salesforce record
async function uploadAndLinkFileToSalesforce(file, linkedEntityId) {
    const fileResponse = await axios.post(
        `${salesforce.instanceUrl}/services/data/v67.0/sobjects/ContentVersion/`,
        {
            Title: file.originalname.replace(/\.[^.]+$/i, ""),
            PathOnClient: file.originalname,
            VersionData: file.buffer.toString("base64")
        },
        {
            headers: {
                Authorization: `Bearer ${salesforce.accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    const contentVersionResponse = await axios.get(
        `${salesforce.instanceUrl}/services/data/v67.0/sobjects/ContentVersion/${fileResponse.data.id}`,
        {
            headers: {
                Authorization: `Bearer ${salesforce.accessToken}`
            }
        }
    );

    const contentDocumentId =
        contentVersionResponse.data.ContentDocumentId;

    await axios.post(
        `${salesforce.instanceUrl}/services/data/v67.0/sobjects/ContentDocumentLink/`,
        {
            ContentDocumentId: contentDocumentId,
            LinkedEntityId: linkedEntityId,
            ShareType: "V",
            Visibility: "AllUsers"
        },
        {
            headers: {
                Authorization: `Bearer ${salesforce.accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    return contentDocumentId;
}


// Submit Talent Community form
app.post(
    "/talent-community",

    talentCommunityUpload.fields([
        { name: "cv", maxCount: 1 },
        { name: "supporting", maxCount: 1 }
    ]),

    async (req, res) => {
        if (!salesforce.accessToken || !salesforce.instanceUrl) {
            return res.status(401).json({
                success: false,
                message:
                    "Salesforce is not connected. Open http://localhost:3000/login first."
            });
        }

        try {
            const {
                firstName,
                lastName,
                email,
                phone,
                location,
                interest,
                opportunity,
                linkedin,
                portfolio,
                summary,
                consent
            } = req.body;

            if (
                !firstName?.trim() ||
                !lastName?.trim() ||
                !email?.trim() ||
                !phone?.trim() ||
                !location?.trim() ||
                !interest?.trim() ||
                !opportunity?.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete all required fields."
                });
            }

            if (consent !== "on" && consent !== "true") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please provide consent before submitting."
                });
            }

            const cv = req.files?.cv?.[0];
            const supportingDocument =
                req.files?.supporting?.[0];

            if (!cv) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please upload your CV in PDF or DOCX format."
                });
            }

            const talentCommunityResponse = await axios.post(
                `${salesforce.instanceUrl}/services/data/v67.0/sobjects/Talent_Community_Application__c/`,
                {
                    First_Name__c: firstName.trim(),
                    Last_Name__c: lastName.trim(),
                    Email_Address__c: email.trim(),
                    Contact_Number__c: phone.trim(),

                    // Temporary Midrand coordinates for the required
                    // Salesforce Geolocation field.
                    Current_Location__Latitude__s: -25.9992,
                    Current_Location__Longitude__s: 28.1263,

                    Area_of_Interest__c: interest,
                    Opportunity_Type__c: opportunity,
                    Profile_Link__c:
                        linkedin?.trim() || null,
                    Portfolio_or_Website__c:
                        portfolio?.trim() || null,
                    Career_Summary__c:
                        summary?.trim() || null,
                    Processing_Consent__c: true
                },
                {
                    headers: {
                        Authorization:
                            `Bearer ${salesforce.accessToken}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const talentCommunityId =
                talentCommunityResponse.data.id;

            const fileIds = [];

            fileIds.push(
                await uploadAndLinkFileToSalesforce(
                    cv,
                    talentCommunityId
                )
            );

            if (supportingDocument) {
                fileIds.push(
                    await uploadAndLinkFileToSalesforce(
                        supportingDocument,
                        talentCommunityId
                    )
                );
            }

            return res.status(201).json({
                success: true,
                message:
                    "Talent Community application submitted successfully!",
                talentCommunityId,
                fileIds
            });
        } catch (error) {
            console.error(
                "Talent Community submission error:",
                error.response?.data || error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Talent Community application submission failed.",
                error:
                    error.response?.data || error.message
            });
        }
    }
);


// Return proper messages for upload errors
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    if (
        error?.message?.includes("PDF") ||
        error?.message?.includes("DOCX")
    ) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    next(error);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Ensure your frontend is served from an allowed origin listed in corsOptions.origin`);
});
