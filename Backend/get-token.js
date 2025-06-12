require('dotenv').config(); // Load environment variables from .env file
const { google } = require('googleapis');
const open = require('open'); // To open the URL in your browser automatically

// Make sure your .env has these values
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // Should be http://localhost:3000/oauth2callback (or your chosen redirect URI)

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("Error: Please make sure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are set in your .env file.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Define the scopes you need for Google Drive
// Choose carefully:
// 'https://www.googleapis.com/auth/drive.file' for app-created files only (recommended for security)
// 'https://www.googleapis.com/auth/drive' for full drive access (to upload to any folder)
const scopes = ['https://www.googleapis.com/auth/drive']; // Adjust if you need broader access

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline', // This is crucial to get a refresh token
  scope: scopes,
});

console.log('1. Visit this URL to authorize your application:');
console.log(url);
console.log('\n2. After authorizing, you will be redirected to:');
console.log(REDIRECT_URI);
console.log('   The URL in your browser will look like:');
console.log('   http://localhost:3000/oauth2callback?code=YOUR_AUTHORIZATION_CODE');
console.log('\n3. Copy the "code" from that URL (e.g., "4/xxxx...") and paste it here:');

// Attempt to open the URL automatically
(async () => {
  try {
    await open(url);
  } catch (error) {
    console.warn("Could not open URL automatically. Please copy and paste the URL manually.");
  }
})();

// This section will handle the code exchange
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.question('Enter the authorization code from the redirected URL: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n--- Tokens Received ---');
    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token); // This is what you need!
    console.log('Expiry Date:', tokens.expiry_date);
    console.log('\n--- IMPORTANT ---');
    console.log('Copy the Refresh Token above and add it to your .env file as:');
    console.log('GOOGLE_REFRESH_TOKEN=YOUR_REFRESH_TOKEN_HERE');
    readline.close();
  } catch (error) {
    console.error('Error getting tokens:', error.message);
    console.error('Make sure the code is correct and hasn\'t expired.');
    readline.close();
  }
});