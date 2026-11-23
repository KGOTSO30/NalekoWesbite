const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const crypto = require("crypto");
const multer = require("multer");
const cors = require("cors");

dotenv.config();

const app = express();

const port = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors({
    origin: [
        "http://127.0.0.1:5503",
        "http://localhost:5503",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://naleko.com",
        "https://www.naleko.com"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
}));

// Serve files from the public folder
app.use(express.static("public"));

// Allow JSON requests
app.use(express.json());

// Allow normal form submissions
app.use(express.urlencoded({ extended: true }));

// ==========================================
// CV UPLOAD CONFIGURATION
// ==========================================

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        if (file.mimetype !== "application/pdf") {

            return cb(
                new Error("Only PDF CV files are allowed.")
            );
        }

        cb(null, true);
    }
});

// Talent Community accepts PDF and DOCX documents up to 5 MB each.
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
            return cb(new Error("Only PDF and DOCX files are allowed."));
        }

        cb(null, true);
    }
});

// ==========================================
// TEMPORARY SALESFORCE STORAGE
// ==========================================

let oauthState = null;
let codeVerifier = null;

let salesforce = {
    accessToken: null,
    instanceUrl: null,
    refreshToken: null
};

// ==========================================
// 1. SALESFORCE LOGIN
// ==========================================

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
        `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;

    console.log("Redirecting to Salesforce...");

    res.redirect(authorizationUrl);
});

// ==========================================
// 2. SALESFORCE CALLBACK
// ==========================================

app.get("/oauth/callback", async (req, res) => {

    const {
        code,
        state,
        error,
        error_description
    } = req.query;

    // Salesforce returned an error
    if (error) {

        return res.status(400).send(`

            <h1>Salesforce Login Error</h1>

            <p>${error}</p>

            <p>
                ${error_description || ""}
            </p>

        `);
    }

    // Check OAuth state
    if (!state || state !== oauthState) {

        return res.status(400).send(`

            <h1>Security Error</h1>

            <p>
                Invalid OAuth state.
            </p>

        `);
    }

    // Check authorization code
    if (!code) {

        return res.status(400).send(`

            <h1>Error</h1>

            <p>
                No authorization code was returned
                by Salesforce.
            </p>

        `);
    }

    try {

        const tokenParams =
            new URLSearchParams();

        tokenParams.append(
            "grant_type",
            "authorization_code"
        );

        tokenParams.append(
            "code",
            code
        );

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

                `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/token`,

                tokenParams.toString(),

                {
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    }
                }
            );

        // Save Salesforce details
        salesforce.accessToken =
            tokenResponse.data.access_token;

        salesforce.instanceUrl =
            tokenResponse.data.instance_url;

        salesforce.refreshToken =
            tokenResponse.data.refresh_token;

        console.log(
            "Salesforce authentication successful!"
        );

        console.log(
            "Salesforce Instance:",
            salesforce.instanceUrl
        );

        res.send(`

            <!DOCTYPE html>

            <html>

            <head>

                <title>
                    Salesforce Connected
                </title>

            </head>

            <body style="
                font-family: Arial;
                padding: 40px;
                text-align: center;
            ">

                <h1>
                    ✅ Salesforce Connected
                </h1>

                <p>
                    Your Naleko website backend
                    successfully connected
                    to Salesforce.
                </p>

                <p>
                    Instance:
                    <strong>
                        ${salesforce.instanceUrl}
                    </strong>
                </p>

                <br>

                <a href="/salesforce-test">
                    Test Salesforce API Connection
                </a>

                <br><br>

                <a href="/applicant-test">
                    Create Test Applicant
                </a>

            </body>

            </html>

        `);

    } catch (error) {

        console.error(
            "Salesforce OAuth Error:",
            error.response?.data ||
            error.message
        );

        res.status(500).send(`

            <h1>
                Salesforce Connection Failed
            </h1>

            <p>
                The connection to Salesforce failed.
            </p>

            <pre>
${JSON.stringify(
    error.response?.data ||
    error.message,
    null,
    2
)}
            </pre>

        `);
    }
});

// ==========================================
// 3. TEST SALESFORCE CONNECTION
// ==========================================

app.get("/salesforce-test", async (req, res) => {

    if (!salesforce.accessToken) {

        return res.status(401).send(`

            <h1>
                Salesforce Not Connected
            </h1>

            <p>
                Please connect to Salesforce first.
            </p>

            <a href="/login">
                Connect to Salesforce
            </a>

        `);
    }

    try {

        const response =
            await axios.get(

                `${salesforce.instanceUrl}/services/data/v67.0/limits/`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${salesforce.accessToken}`
                    }
                }
            );

        res.json({

            success: true,

            message:
                "Salesforce API connection is working!",

            salesforceInstance:
                salesforce.instanceUrl,

            limits:
                response.data
        });

    } catch (error) {

        console.error(
            "Salesforce API error:",
            error.response?.data ||
            error.message
        );

        res.status(500).json({

            success: false,

            message:
                "Salesforce API connection failed.",

            error:
                error.response?.data ||
                error.message
        });
    }
});

// ==========================================
// 4. TEST CREATE APPLICANT
// ==========================================

app.get("/applicant-test", async (req, res) => {

    if (!salesforce.accessToken) {

        return res.redirect("/login");
    }

    try {

        const response =
            await axios.post(

                `${salesforce.instanceUrl}/services/data/v67.0/sobjects/Applicant__c/`,

                {

                    First_Name__c:
                        "Test",

                    Last_Name__c:
                        "Applicant",

                    Email__c:
                        "test@naleko.co.za",

                    Phone__c:
                        "0712345678"

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

        res.json({

            success: true,

            message:
                "Test Applicant created successfully in Salesforce!",

            salesforceResult:
                response.data
        });

    } catch (error) {

        console.error(
            "Applicant creation error:",
            error.response?.data ||
            error.message
        );

        res.status(500).json({

            success: false,

            message:
                "Failed to create Applicant in Salesforce",

            error:
                error.response?.data ||
                error.message
        });
    }
});

// ==========================================
// 5. REAL WEBSITE APPLICATION
//    APPLICANT + CV
// ==========================================

app.post(
    "/apply",
    upload.single("cv"),
    async (req, res) => {

        // Check Salesforce connection
        if (!salesforce.accessToken) {

            return res.status(401).json({

                success: false,

                message:
                    "Salesforce is not connected. Please login first."
            });
        }

        try {

            // Get applicant information
            const {
                firstName,
                lastName,
                email,
                phone,
                position
            } = req.body;

            // Check required fields
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

            // Check CV
            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please upload your CV in PDF format."
                });
            }

            console.log(
                "Applicant:",
                firstName,
                lastName
            );

            console.log(
                "CV:",
                req.file.originalname
            );

            // ======================================
            // CREATE APPLICANT
            // ======================================

            const applicantResponse =
                await axios.post(

                    `${salesforce.instanceUrl}/services/data/v67.0/sobjects/Applicant__c/`,

                    {

                        First_Name__c:
                            firstName,

                        Last_Name__c:
                            lastName,

                        Email__c:
                            email,

                        Phone__c:
                            phone,

                        Position__c:
                            position

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

            console.log(
                "Applicant created:",
                applicantId
            );

            // ======================================
            // CONVERT CV TO BASE64
            // ======================================

            const cvBase64 =
                req.file.buffer.toString("base64");

            // ======================================
            // CREATE SALESFORCE FILE
            // ======================================

            const fileResponse =
                await axios.post(

                    `${salesforce.instanceUrl}/services/data/v67.0/sobjects/ContentVersion/`,

                    {

                        Title:
                            req.file.originalname
                                .replace(/\.pdf$/i, ""),

                        PathOnClient:
                            req.file.originalname,

                        VersionData:
                            cvBase64

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

            const contentVersionId =
                fileResponse.data.id;

            console.log(
                "CV uploaded:",
                contentVersionId
            );

            // ======================================
            // GET CONTENT DOCUMENT ID
            // ======================================

            const contentVersionResponse =
                await axios.get(

                    `${salesforce.instanceUrl}/services/data/v67.0/sobjects/ContentVersion/${contentVersionId}`,

                    {

                        headers: {

                            Authorization:
                                `Bearer ${salesforce.accessToken}`
                        }
                    }
                );

            const contentDocumentId =
                contentVersionResponse
                    .data
                    .ContentDocumentId;

            console.log(
                "Content Document ID:",
                contentDocumentId
            );

            // ======================================
            // LINK CV TO APPLICANT
            // ======================================

            await axios.post(

                `${salesforce.instanceUrl}/services/data/v67.0/sobjects/ContentDocumentLink/`,

                {

                    ContentDocumentId:
                        contentDocumentId,

                    LinkedEntityId:
                        applicantId,

                    ShareType:
                        "V",

                    Visibility:
                        "AllUsers"

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

            console.log(
                "CV successfully linked to Applicant."
            );

            // ======================================
            // SUCCESS
            // ======================================

            res.json({

                success: true,

                message:
                    "Application submitted successfully!",

                applicantId:
                    applicantId,

                fileId:
                    contentDocumentId
            });

        } catch (error) {

            console.error(
                "Application error:",
                error.response?.data ||
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    "Application submission failed.",

                error:
                    error.response?.data ||
                    error.message
            });
        }
    }
);

// ==========================================
// 6. TALENT COMMUNITY APPLICATION
//    RECORD + CV + OPTIONAL SUPPORTING FILE
// ==========================================

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

    const contentDocumentId = contentVersionResponse.data.ContentDocumentId;

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

app.post(
    "/talent-community",
    talentCommunityUpload.fields([
        { name: "cv", maxCount: 1 },
        { name: "supporting", maxCount: 1 }
    ]),
    async (req, res) => {
        if (!salesforce.accessToken) {
            return res.status(401).json({
                success: false,
                message: "Salesforce is not connected. Please login first."
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
                    message: "Please provide consent before submitting."
                });
            }

            const cv = req.files?.cv?.[0];
            const supportingDocument = req.files?.supporting?.[0];

            if (!cv) {
                return res.status(400).json({
                    success: false,
                    message: "Please upload your CV in PDF or DOCX format."
                });
            }

            const talentCommunityResponse = await axios.post(
                `${salesforce.instanceUrl}/services/data/v67.0/sobjects/Talent_Community_Application__c/`,
                {
                    First_Name__c: firstName.trim(),
                    Last_Name__c: lastName.trim(),
                    Email_Address__c: email.trim(),
                    Contact_Number__c: phone.trim(),
                    Current_Location__Latitude__s: -25.9992,
Current_Location__Longitude__s: 28.1263,
                    Current_Location_Text__c: location.trim(),
                    Area_of_Interest__c: interest,
                    Opportunity_Type__c: opportunity,
                    Profile_Link__c: linkedin?.trim() || null,
                    Portfolio_or_Website__c: portfolio?.trim() || null,
                    Career_Summary__c: summary?.trim() || null,
                    Processing_Consent__c: true
                },
                {
                    headers: {
                        Authorization: `Bearer ${salesforce.accessToken}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const talentCommunityId = talentCommunityResponse.data.id;
            const fileIds = [];

            fileIds.push(
                await uploadAndLinkFileToSalesforce(cv, talentCommunityId)
            );

            if (supportingDocument) {
                fileIds.push(
                    await uploadAndLinkFileToSalesforce(
                        supportingDocument,
                        talentCommunityId
                    )
                );
            }

            res.status(201).json({
                success: true,
                message: "Talent Community application submitted successfully!",
                talentCommunityId,
                fileIds
            });
        } catch (error) {
            console.error(
                "Talent Community submission error:",
                error.response?.data || error.message
            );

            res.status(500).json({
                success: false,
                message: "Talent Community application submission failed.",
                error: error.response?.data || error.message
            });
        }
    }
);

// Return JSON for Multer validation and upload errors.
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError || error?.message?.includes("PDF")) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    next(error);
});

// ==========================================
// 7. START SERVER
// ==========================================

app.listen(port, () => {

    console.log(
        `Naleko Recruitment Demo running at http://localhost:${port}`
    );

});
