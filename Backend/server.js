const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const salesforce = require("./salesforceClient");
const { handleTalentFiles, uploadErrorHandler } = require("./uploadMiddleware");

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "https://naleko.com,https://www.naleko.com,http://127.0.0.1:5503,http://localhost:5503,http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:5501,http://localhost:5501"
)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: allowedOrigins,
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        salesforceConfigured: salesforce.isConfigured()
    });
});

app.get("/login", (req, res) => {
    if (!process.env.SALESFORCE_CLIENT_ID || !process.env.SALESFORCE_LOGIN_URL) {
        return res.status(500).send("Missing Salesforce OAuth configuration in Backend/.env.");
    }
    res.redirect(salesforce.buildAuthorizationUrl());
});

app.get("/oauth/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
        return res.status(400).send(`<h1>Salesforce Login Error</h1><p>${error}: ${error_description || ""}</p>`);
    }

    try {
        const result = await salesforce.exchangeCodeForTokens(code, state);
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><title>Salesforce Connected</title></head>
            <body style="font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; padding: 20px;">
                <h1>Salesforce Connected</h1>
                <p>Instance: <strong>${result.instanceUrl}</strong></p>
                <p>Refresh token saved to <code>Backend/.env</code>.</p>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("Salesforce OAuth Error:", JSON.stringify(err.response?.data || err.message, null, 2));
        res.status(500).send(`<h1>Salesforce Connection Failed</h1><pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>`);
    }
});

app.post("/talent-community", handleTalentFiles, async (req, res) => {
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
        const supporting = req.files?.supporting?.[0];

        if (!cv) {
            return res.status(400).json({
                success: false,
                message: "Please upload your CV in PDF or DOCX format."
            });
        }

        const recordId = await salesforce.createTalentCommunityRecord({
            First_Name__c: firstName.trim(),
            Last_Name__c: lastName.trim(),
            Email_Address__c: email.trim(),
            Contact_Number__c: phone.trim(),
            Current_Location_Text__c: location.trim(),
            Area_of_Interest__c: interest.trim(),
            Opportunity_Type__c: opportunity.trim(),
            Profile_Link__c: linkedin?.trim() || null,
            Portfolio_or_Website__c: portfolio?.trim() || null,
            Career_Summary__c: summary?.trim() || null,
            Processing_Consent__c: true
        });

        const fileIds = [await salesforce.uploadAndLinkFile(cv, recordId)];

        if (supporting) {
            fileIds.push(await salesforce.uploadAndLinkFile(supporting, recordId));
        }

        return res.status(201).json({
            success: true,
            message: "Talent Community application submitted successfully!",
            talentCommunityId: recordId,
            fileIds
        });
    } catch (error) {
        console.error(
            "Talent Community submission error:",
            JSON.stringify(error.response?.data || error.message, null, 2)
        );
        return res.status(500).json({
            success: false,
            message: "We could not submit your profile right now. Please try again shortly."
        });
    }
});

app.use(uploadErrorHandler);

app.listen(PORT, () => {
    console.log(`Naleko Talent Community API running on port ${PORT}`);
});