

// Get the form and the status message element
const form = document.getElementById('Form-N');
const statusMessage = document.getElementById('status-message');
const submitButton = document.getElementById('submit-button');

// The URL of your Google Apps Script Web App
const scriptURL = 'https://script.google.com/macros/s/AKfycbyK2m_0BfMKXvKoDixP0DeZMlOq5jVSmiFCMAZ8HybZi5LLebMV_mn0u5QW2IbJj8vr/exec';

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
            statusMessage.textContent = 'Oops! There was a problem. Please try again later.';
            statusMessage.className = 'text-red-600'; // Tailwind class for red text
        })
        .finally(() => {
            // Re-enable the submit button after 3 seconds
            setTimeout(() => {
                submitButton.disabled = false;
                submitButton.textContent = 'Send Message';
                statusMessage.textContent = ''; // Clear the status message
            }, 3000);
        });
});