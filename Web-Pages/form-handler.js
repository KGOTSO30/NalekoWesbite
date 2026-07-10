

// Get the form and the status message element
const form = document.getElementById('Form-N');
const statusMessage = document.getElementById('status-message');
const submitButton = document.getElementById('submit-button');

// The URL of your Google Apps Script Web App
const scriptURL = 'https://script.google.com/macros/s/AKfycbxWUYay1hRmEzHsM95J67LSglCfD0FRMwylNW5Yo8djB9uL8tNVB85agSAGQvmlR0wN/exec';

form.addEventListener('submit', e => {
    // Prevent the default form submission behavior (which reloads the page)
    e.preventDefault();

    // Disable the submit button and show a "loading" state
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';

    // Use the Fetch API to send the form data
    fetch(scriptURL, { method: 'POST', body: new FormData(form) })
        .then(response => response.json()) // The script returns a JSON response
        .then(data => {
            console.log('Success:', data);
            
            // Handle success
            statusMessage.textContent = 'Thank you! Your message has been sent successfully.';
            statusMessage.className = 'text-green-600'; // Tailwind class for green text
            form.reset(); // Clear the form fields
        })
        .catch(error => {
            console.error('Error!', error.message);

            // Handle error
            statusMessage.textContent = 'Thank you! Your message has been sent successfully.';
            statusMessage.className = 'text-red-600'; // Tailwind class for red text
        })
        .finally(() => {
            // Re-enable the submit button after 3 seconds
            setTimeout(() => {
                submitButton.disabled = false;
                submitButton.textContent = 'Send Message Again';
                statusMessage.textContent = ''; // Clear the status message
            }, 3000);
        });
});