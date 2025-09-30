const headline = document.getElementById("headline");
const message = document.getElementById("message");

const greetings = [
    "Shine bright today.",
    "Prioritize what matters.",
    "Lean into your momentum.",
    "Take a mindful break.",
    "Line up your next win."
];

const index = Math.floor(Math.random() * greetings.length);

if (headline) {
    headline.textContent = "Aurora";
}

if (message) {
    message.textContent = greetings[index];
}
