# QuickNotes — Notes Manager

## Overview
QuickNotes is a simple, responsive web application for creating, organising, searching, and deleting notes. It was built using HTML, CSS, and JavaScript.

## Features
- Create notes with Personal, Work, or Study categories.
- Validate empty submissions and prevent duplicate notes within the same category.
- Display notes as dynamically generated cards with timestamps.
- Distinguish categories using coloured card borders.
- Search notes in real time by note content or category.
- Delete individual notes.
- Save notes in browser localStorage so they remain available after refreshing the page.
- Responsive layout for desktop and mobile screens.

## Technologies Used
- HTML5
- CSS3
- JavaScript (ES6+)
- Browser localStorage

## Project Structure
```text
web-foundations-days/
├── index.html
├── style.css
├── script.js
├── README.md
├── day 1/
├── day 2/
├── day 3/
└── day 4/
```

## How to Run
1. Clone or download this repository.
2. Open the root `index.html` file in a browser, or use Visual Studio Code with the Live Server extension.
3. Create a note by entering text and selecting a category.
4. Search notes using the search field, or delete notes using their Delete buttons.

## Data Storage
Notes are stored in the browser's localStorage. They persist across page refreshes in the same browser, but are not synchronised between devices.

## Future Improvements
- Edit existing notes.
- Add more categories.
- Export and import notes.
- Add sorting and date filters.

## Author
Developed as part of the Web Foundations learning project.