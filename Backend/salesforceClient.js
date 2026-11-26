const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const API_VERSION = "v67.0";
const ENV_PATH = path.join(__dirname, ".env");

let oauthState = null;
let codeVerifier = null;

const session = {
    accessToken: null,
    instanceUrl: null,
    refreshToken: process.env.SALESFORCE_REFRESH_TOKEN || null
};

function persistRefreshToken(newToken) {
    if (!newToken) return;
    session.refreshToken = newToken;
    process.env.SALESFORCE_REFRESH_TOKEN = newToken;

    if (!fs.existsSync(ENV_PATH)) return;
    let content = fs.readFileSync(ENV_PATH, "utf8");
    if (/^SALESFORCE_REFRESH_TOKEN=.*/m.test(content)) {
        content = content.replace(/^SALESFORCE_REFRESH_TOKEN=.*/m, `SALESFORCE_REFRESH_TOKEN=${newToken}`);
    } else {
        content += `${content.endsWith("\n") ? "" : "\n"}SALESFORCE_REFRESH_TOKEN=${newToken}\n`;
    }
    fs.writeFileSync(ENV_PATH, content, "utf8");
}

function buildAuthorizationUrl() {
    oauthState = crypto.randomBytes(32).toString("hex");
    codeVerifier = crypto.randomBytes(32).toString("base64url");

    const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

    const params = new URLSearchParams({
        response_type: "code",
        client_id: process.env.SALESFORCE_CLIENT_ID,
        redirect_uri: process.env.SALESFORCE_REDIRECT_URI,
        state: oauthState,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        scope: "api refresh_token offline_access"
    });

    return `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code, state) {
    if (!state || state !== oauthState) {
        throw new Error("Invalid OAuth state.");
    }
    if (!code) {
        throw new Error("No authorization code returned by Salesforce.");
    }

    const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        redirect_uri: process.env.SALESFORCE_REDIRECT_URI,
        code_verifier: codeVerifier
    });

    const response = await axios.post(
        `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
        tokenParams.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    session.accessToken = response.data.access_token;
    session.instanceUrl = response.data.instance_url;
    if (response.data.refresh_token) {
        persistRefreshToken(response.data.refresh_token);
    }

    oauthState = null;
    codeVerifier = null;

    return {
        instanceUrl: session.instanceUrl,
        refreshToken: session.refreshToken
    };
}

async function refreshAccessToken() {
    const refreshToken = session.refreshToken || process.env.SALESFORCE_REFRESH_TOKEN;

    if (!refreshToken) {
        throw new Error("Salesforce is not connected. Run 'npm run get-token' first.");
    }

    const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        refresh_token: refreshToken
    });

    const response = await axios.post(
        `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
        params.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    session.accessToken = response.data.access_token;
    session.instanceUrl = response.data.instance_url;

    // Persist rotated refresh token if Salesforce External Client App issues a new one
    if (response.data.refresh_token) {
        persistRefreshToken(response.data.refresh_token);
    }
}

async function sfRequest(method, apiPath, data = null) {
    if (!session.accessToken || !session.instanceUrl) {
        await refreshAccessToken();
    }

    const makeCall = () =>
        axios({
            method,
            url: `${session.instanceUrl}/services/data/${API_VERSION}${apiPath}`,
            data,
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
                "Content-Type": "application/json"
            }
        });

    try {
        return await makeCall();
    } catch (error) {
        if (error.response?.status === 401) {
            await refreshAccessToken();
            return await makeCall();
        }
        throw error;
    }
}

async function createTalentCommunityRecord(fields) {
    const response = await sfRequest(
        "POST",
        "/sobjects/Talent_Community_Application__c",
        fields
    );
    return response.data.id;
}

async function uploadAndLinkFile(file, linkedEntityId) {
    const response = await sfRequest("POST", "/sobjects/ContentVersion", {
        Title: file.originalname.replace(/\.[^.]+$/i, ""),
        PathOnClient: file.originalname,
        VersionData: file.buffer.toString("base64"),
        FirstPublishLocationId: linkedEntityId
    });
    return response.data.id;
}

function isConfigured() {
    return Boolean(
        process.env.SALESFORCE_CLIENT_ID &&
        process.env.SALESFORCE_CLIENT_SECRET &&
        (session.refreshToken || process.env.SALESFORCE_REFRESH_TOKEN || session.accessToken)
    );
}

module.exports = {
    buildAuthorizationUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    createTalentCommunityRecord,
    uploadAndLinkFile,
    isConfigured
};