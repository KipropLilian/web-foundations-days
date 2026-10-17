
const noteForm = document.getElementById("note-form");
const noteText = document.getElementById("note-text");
const noteCategory = document.getElementById("note-category");
const validationMessage = document.getElementById("validation-message");
const searchInput = document.getElementById("search-input");
const notesList = document.getElementById("notes-list");
const notesSummary = document.getElementById("notes-summary");
const emptyMessage = document.getElementById("empty-message");

const STORAGE_KEY = "quicknotes-project-notes";

let notes = loadNotes();

function loadNotes() {
  try {
    const savedNotes = localStorage.getItem(STORAGE_KEY);

    if (!savedNotes) {
      return [];
    }

    const parsedNotes = JSON.parse(savedNotes);

    if (!Array.isArray(parsedNotes)) {
      return [];
    }

    return parsedNotes.filter((note) =>
      note &&
      typeof note.id === "string" &&
      typeof note.text === "string" &&
      ["personal", "work", "study"].includes(note.category) &&
      typeof note.timestamp === "string"
    );
  } catch (error) {
    console.error("Could not load saved notes:", error);
    return [];
  }
}

function saveNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (error) {
    validationMessage.textContent =
      "Unable to save notes in this browser. Check your storage settings.";
    console.error("Could not save notes:", error);
  }
}

function renderNotes() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  const filteredNotes = notes.filter((note) =>
    note.text.toLowerCase().includes(searchTerm) ||
    note.category.toLowerCase().includes(searchTerm)
  );

  notesList.replaceChildren();

  notesSummary.textContent =
    `${filteredNotes.length} of ${notes.length} note${notes.length === 1 ? "" : "s"}`;

  emptyMessage.hidden = filteredNotes.length > 0;

  if (notes.length === 0) {
    emptyMessage.textContent = "No notes yet. Create your first note!";
  } else if (filteredNotes.length === 0) {
    emptyMessage.textContent = "No notes match your search.";
  }

  filteredNotes.forEach((note) => {
    const card = document.createElement("article");
    card.className = `note-card category-${note.category}`;

    const cardHeader = document.createElement("div");
    cardHeader.className = "note-card-header";

    const category = document.createElement("span");
    category.className = "note-category";
    category.textContent = note.category;

    const timestamp = document.createElement("time");
    timestamp.className = "note-timestamp";
    timestamp.dateTime = note.timestamp;

    const parsedDate = new Date(note.timestamp);
    timestamp.textContent = Number.isNaN(parsedDate.getTime())
      ? "Date unavailable"
      : parsedDate.toLocaleString();

    cardHeader.append(category, timestamp);

    const content = document.createElement("p");
    content.textContent = note.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${note.category} note`);
    deleteButton.addEventListener("click", () => {
      deleteNote(note.id);
    });

    card.append(cardHeader, content, deleteButton);
    notesList.append(card);
  });
}

function addNote(text, category) {
  const note = {
    id: crypto.randomUUID(),
    text,
    category,
    timestamp: new Date().toISOString()
  };

  notes.unshift(note);
  saveNotes();
  renderNotes();
}

function deleteNote(id) {
  notes = notes.filter((note) => note.id !== id);
  saveNotes();
  renderNotes();
}

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = noteText.value.trim();
  const category = noteCategory.value;

  if (!text) {
    validationMessage.textContent = "Please enter a note before submitting.";
    noteText.focus();
    return;
  }

  if (text.length > 200) {
    validationMessage.textContent = "Your note must be 200 characters or fewer.";
    noteText.focus();
    return;
  }

  if (!["personal", "work", "study"].includes(category)) {
    validationMessage.textContent = "Please select a valid category.";
    noteCategory.focus();
    return;
  }

  const duplicateExists = notes.some(
    (note) =>
      note.text.trim().toLowerCase() === text.toLowerCase() &&
      note.category === category
  );

  if (duplicateExists) {
    validationMessage.textContent =
      "You already have an identical note in this category.";
    noteText.focus();
    return;
  }

  addNote(text, category);
  noteForm.reset();
  validationMessage.textContent = "";
  noteText.focus();
});

searchInput.addEventListener("input", renderNotes);

renderNotes();
