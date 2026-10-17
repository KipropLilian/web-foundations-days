const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

function updateCounts() {
  const text = noteText.value;
  const characters = text.length;
  const trimmedText = text.trim();
  const words = trimmedText === "" ? 0 : trimmedText.split(/\s+/).length;

  charCount.textContent = `${characters} / 200 characters`;
  wordCount.textContent = `${words} words`;

  charCount.classList.remove("warning", "over");

  if (characters > 200) {
    charCount.classList.add("over");
  } else if (characters > 180) {
    charCount.classList.add("warning");
  }
}
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("quicknotes-draft", noteText.value);
});
function clearNote() {
  noteText.value = "";
  updateCounts();
  localStorage.removeItem("quicknotes-draft");
}

clearBtn.addEventListener("click", clearNote);

noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");

  applyTheme(isDark);
  localStorage.setItem("quicknotes-theme", isDark ? "dark" : "light");
});
const savedDraft = localStorage.getItem("quicknotes-draft");

if (savedDraft !== null) {
  noteText.value = savedDraft;
}

const savedTheme = localStorage.getItem("quicknotes-theme");
applyTheme(savedTheme === "dark");

updateCounts();