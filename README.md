# Paper Ink PDF Editor

A lightweight browser-based PDF text editor.

## What it does

- Upload a PDF from your computer
- Click any page to add a text box
- Type directly on the page or in the side editor
- Move text boxes around
- Download the edited PDF

## How to use it

1. Run `.\start-editor.ps1` from PowerShell, or open `index.html` in a browser.
2. Choose a PDF file.
3. Click `Add Text`, then click a page where you want the text to appear.
4. Edit the text, color, or size.
5. Click `Download Edited PDF`.

## Notes

- The app uses `pdf.js` for previewing and `pdf-lib` for exporting the edited PDF.
- Third-party libraries are loaded from CDNs, so an internet connection is needed when the page first loads.
- `start-editor.ps1` starts a simple local web server at `http://localhost:4173`.
