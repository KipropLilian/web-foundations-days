let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];
function searchNotes(word) {
  return notes.filter((note) =>
    note.text.toLowerCase().includes(word.toLowerCase())
  );
}
function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];

  for (let note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }

  return longest;
}
function countByCategory() {
  let counts = {};

  for (let note of notes) {
    if (counts[note.category]) {
      counts[note.category]++;
    } else {
      counts[note.category] = 1;
    }
  }

  return counts;
}
function getSummary() {
  const counts = countByCategory();
  const noteWord = notes.length === 1 ? "note" : "notes";

  return `${notes.length} ${noteWord}: ${counts.personal || 0} personal, ${counts.work || 0} work, ${counts.study || 0} study.`;
}
function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();

  return notes.some(
    (note) => note.text.trim().toLowerCase() === normalizedText
  );
}
function addNote(text, category) {
  const trimmedText = text.trim();
  const validCategories = ["personal", "work", "study"];

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log("Note must be between 1 and 200 characters.");
    return false;
  }

  if (isDuplicate(trimmedText)) {
    console.log("Note already exists.");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log("Invalid category.");
    return false;
  }

  const newId =
    notes.length > 0
      ? Math.max(...notes.map((note) => note.id)) + 1
      : 1;

  notes.push({
    id: newId,
    text: trimmedText,
    category: category,
  });

  console.log("Note added successfully.");
  return true;
}
console.log(searchNotes("day")); // Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]
console.log(searchNotes("xyz")); // Expected: []

console.log(longestNote()); // Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

let savedNotes = notes;
notes = [];
console.log(longestNote()); // Expected: null
notes = savedNotes;

console.log(countByCategory()); // Expected: { personal: 2, study: 2, work: 1 }

notes = [savedNotes[0]];
console.log(countByCategory()); // Expected: { personal: 1 }
notes = savedNotes;

console.log(getSummary()); // Expected: "5 notes: 2 personal, 1 work, 2 study."

notes = [savedNotes[0]];
console.log(getSummary()); // Expected: "1 note: 1 personal, 0 work, 0 study."
notes = savedNotes;

console.log(isDuplicate("  BUY MILK AND BREAD  ")); // Expected: true
console.log(isDuplicate("Buy eggs")); // Expected: false

console.log(addNote("Read a JavaScript book", "study")); // Expected: true
console.log(addNote("BUY MILK AND BREAD", "personal")); // Expected: false
console.log(addNote("New note", "other")); // Expected: false