const talentForm = document.getElementById("talent-community-form");
const talentStatus = document.getElementById("tc-status");
const submitButton = talentForm?.querySelector('button[type="submit"]');

const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const API_BASE_URL =
    window.TALENT_COMMUNITY_API_URL ||
    (isLocalHost ? "http://localhost:3001" : "https://nalekowesbite-v2.onrender.com");

const THANK_YOU_ROUTE = isLocalHost
    ? "/Web-Pages/TalentThankYouPage-Test.html"
    : "/Thank-You/";

if (!isLocalHost) {
    fetch(`${API_BASE_URL}/health`, { method: "GET", mode: "cors" }).catch(() => {});
}

function validateDocument(input) {
    if (!input) return;
    input.setCustomValidity("");

    const file = input.files[0];
    if (!file) return;

    if (!/\.(pdf|docx)$/i.test(file.name)) {
        input.setCustomValidity("Please upload a PDF or DOCX file.");
    } else if (file.size > 5 * 1024 * 1024) {
        input.setCustomValidity("The file must be 5 MB or smaller.");
    }
}

["cv", "supporting"].forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener("change", () => {
        validateDocument(input);
        input.reportValidity();
    });
});

["firstName", "lastName", "location", "phone"].forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener("input", () => {
        input.setCustomValidity(
            input.value.trim() ? "" : "Please complete this field."
        );
    });
});

talentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    validateDocument(document.getElementById("cv"));
    validateDocument(document.getElementById("supporting"));

    if (!talentForm.checkValidity()) {
        talentForm.reportValidity();
        return;
    }

    talentStatus.hidden = false;
    talentStatus.textContent = "Submitting your profile...";
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
        const response = await fetch(`${API_BASE_URL}/talent-community`, {
            method: "POST",
            body: new FormData(talentForm)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "We could not submit your profile. Please try again."
            );
        }

        const candidateEmail = encodeURIComponent(
            document.getElementById("email").value.trim()
        );
        window.location.href = `${THANK_YOU_ROUTE}?email=${candidateEmail}`;
    } catch (error) {
        talentStatus.textContent = error.message;
        talentStatus.scrollIntoView({ behavior: "smooth", block: "center" });
        submitButton.disabled = false;
        submitButton.textContent = "Join Talent Community";
    }
});
