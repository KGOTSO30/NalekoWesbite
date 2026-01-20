
/*
const urlMappings = {
'/Web-Pages/ContactUs.html': '/contact-us/',
'/Web-Pages/WhoWeAre.html': '/about-us/',
'/Web-Pages/WhatWeDo.html': '/what-we-do/',
'/Web-Pages/WhoWeServe.html': '/who-we-serve/',
'/Web-Pages/CorpTraining.html': '/corporate-training/',
'/Web-Pages/Academy.html': '/naleko-academy/',
'/Web-Pages/GirlsInTech.html': '/girls-in-tech/',

'/Web-Pages/404.html': '/404/',
};

const currentUrl = window.location.pathname;

Object.keys(urlMappings).forEach((oldUrl) => {
if (currentUrl === oldUrl) {
// Rewrite the URL
window.history.pushState({}, '', urlMappings[oldUrl]);
}
});

*/


// The content area to update
const contentArea = document.getElementById('content');

// Define the route mappings (clean URL to actual file)
const routes = {
  '/contact-us/': '/Web-Pages/ContactUs.html',
  '/about-us/': '/Web-Pages/WhoWeAre.html',
  '/what-we-do/': '/Web-Pages/WhatWeDo.html',
  '/who-we-serve/': '/Web-Pages/WhoWeServe.html',
  '/corporate-training/': '/Web-Pages/CorpTraining.html',
  '/naleko-academy/': '/Web-Pages/Academy.html',
  '/girls-in-tech/': '/Web-Pages/GirlsInTech.html',
};

// Function to handle navigation
const navigate = async (path) => {
  // Update the URL in the address bar
  window.history.pushState({}, '', path);

  // Get the actual file path from our routes
  const file = routes[path] || routes['/404/'];

  try {
    // Fetch the content of the new page
    const response = await fetch(file);
    const html = await response.text();

    // To avoid loading the whole HTML document (including <html>, <head>, <body> tags),
    // we parse it and grab only the content from its main area.
    // NOTE: This assumes your other pages also have a <main id="content"> tag.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newContent = doc.getElementById('content').innerHTML;

    // Update the content on the current page
    contentArea.innerHTML = newContent;
  } catch (error) {
    console.error('Failed to load page:', error);
    contentArea.innerHTML = '<h1>Error loading page</h1>';
  }
};

// Listen for clicks on the navigation links
document.getElementById('menu').addEventListener('click', (event) => {
  // Check if a link was clicked
  if (event.target.tagName === 'A') {
    // Stop the browser from doing a full page reload
    event.preventDefault();

    // Get the destination path from the link's href
    const path = event.target.getAttribute('href');

    // Call our navigation function
    navigate(path);
  }
});