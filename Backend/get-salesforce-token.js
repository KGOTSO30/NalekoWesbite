const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const express = require("express");
const dotenv = require("dotenv");

const envPath = path.join(__dirname, ".env");
dotenv.config({ path: envPath });

const salesforce = require("./salesforceClient");

const PORT = Number(process.env.PORT) || 3001;
const REDIRECT_URI = process.env.SALESFORCE_REDIRECT_URI || `http://localhost:${PORT}/oauth/callback`;

if (!process.env.SALESFORCE_CLIENT_ID || !process.env.SALESFORCE_CLIENT_SECRET || !process.env.SALESFORCE_LOGIN_URL) {
    console.error("\n[Error] Missing Salesforce credentials in Backend/.env.");
    console.error("Ensure SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, and SALESFORCE_LOGIN_URL are set first.\n");
    process.exit(1);
}

process.env.SALESFORCE_REDIRECT_URI = REDIRECT_URI;

function saveRefreshTokenToEnv(refreshToken) {
    if (!fs.existsSync(envPath)) {
        return false;
    }
    let content = fs.readFileSync(envPath, "utf8");
    if (/^SALESFORCE_REFRESH_TOKEN=.*/m.test(content)) {
        content = content.replace(/^SALESFORCE_REFRESH_TOKEN=.*/m, `SALESFORCE_REFRESH_TOKEN=${refreshToken}`);
    } else {
        content += `${content.endsWith("\n") ? "" : "\n"}SALESFORCE_REFRESH_TOKEN=${refreshToken}\n`;
    }
    fs.writeFileSync(envPath, content, "utf8");
    return true;
}

function openBrowser(url) {
    const command =
        process.platform === "win32"
            ? `start "" "${url}"`
            : process.platform === "darwin"
            ? `open "${url}"`
            : `xdg-open "${url}"`;
    exec(command, () => {});
}

const app = express();

app.get("/oauth/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
        res.status(400).send(`<h1>Salesforce Authorization Failed</h1><p>${error}: ${error_description || ""}</p>`);
        console.error(`\n[Error] Salesforce returned: ${error} - ${error_description || ""}`);
        process.exit(1);
    }

    try {
        const result = await salesforce.exchangeCodeForTokens(code, state);

        if (!result.refreshToken) {
            res.status(400).send("<h1>No Refresh Token Returned</h1><p>Check that your Connected App includes the <strong>offline_access / refresh_token</strong> OAuth scope.</p>");
            console.error("\n[Error] Salesforce did not return a refresh_token. Enable 'Perform requests at any time (refresh_token, offline_access)' on your Connected App.");
            process.exit(1);
        }

        const saved = saveRefreshTokenToEnv(result.refreshToken);

        console.log("\n==================================================");
        console.log("Salesforce Connected Successfully!");
        console.log("Instance URL:", result.instanceUrl);
        console.log("Refresh Token:", result.refreshToken);
        if (saved) {
            console.log("Saved automatically to Backend/.env as SALESFORCE_REFRESH_TOKEN.");
        } else {
            console.log("Copy this token into Backend/.env as SALESFORCE_REFRESH_TOKEN.");
        }
        console.log("==================================================\n");

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><title>Salesforce Token Captured</title></head>
            <body style="font-family: Arial, sans-serif; max-width: 640px; margin: 40px auto; padding: 20px;">
                <h1>Salesforce Connected</h1>
                <p>Instance: <strong>${result.instanceUrl}</strong></p>
                <p>${saved ? "Your refresh token has been saved automatically to <code>Backend/.env</code>." : "Copy the token below into <code>Backend/.env</code>:"}</p>
                <textarea readonly rows="3" style="width: 100%; font-family: monospace; padding: 10px;">${result.refreshToken}</textarea>
                <p>You can close this browser tab and run <code>npm start</code>.</p>
            </body>
            </html>
        `);

        setTimeout(() => {
            server.close(() => process.exit(0));
        }, 500);
    } catch (err) {
        console.error("\n[Error] Token exchange failed:", err.response?.data || err.message);
        res.status(500).send(`<pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>`);
        setTimeout(() => process.exit(1), 500);
    }
});

const server = app.listen(PORT, () => {
    const authUrl = salesforce.buildAuthorizationUrl();
    console.log("\nOpening Salesforce login in your browser...");
    console.log("If your browser does not open automatically, visit:\n");
    console.log(authUrl + "\n");
    openBrowser(authUrl);
});
