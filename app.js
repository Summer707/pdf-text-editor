const pdfUploadInput = document.getElementById("pdf-upload");
const addTextButton = document.getElementById("add-text-button");
const deleteTextButton = document.getElementById("delete-text-button");
const downloadButton = document.getElementById("download-button");
const fontSizeInput = document.getElementById("font-size");
const fontSizeValue = document.getElementById("font-size-value");
const fontColorInput = document.getElementById("font-color");
const textEditor = document.getElementById("text-editor");
const zoomInput = document.getElementById("zoom-level");
const zoomValue = document.getElementById("zoom-level-value");
const statusText = document.getElementById("status-text");
const documentMeta = document.getElementById("document-meta");
const emptyState = document.getElementById("empty-state");
const pageContainer = document.getElementById("page-container");

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const measurementCanvas = document.createElement("canvas");
const measurementContext = measurementCanvas.getContext("2d");

const state = {
  originalBytes: null,
  fileName: "",
  pdfjsDocument: null,
  textItems: [],
  selectedTextId: null,
  nextTextId: 1,
  pageViews: [],
  zoom: 1.4,
  addTextMode: false,
  zoomTimer: null
};

function setStatus(message) {
  statusText.textContent = message;
}

function setDocumentMeta(message) {
  documentMeta.textContent = message;
}

function toggleEditorAvailability(hasDocument) {
  addTextButton.disabled = !hasDocument;
  downloadButton.disabled = !hasDocument;
  zoomInput.disabled = !hasDocument;
}

function updateSelectionControls() {
  const selected = getSelectedTextItem();
  const hasSelection = Boolean(selected);

  deleteTextButton.disabled = !hasSelection;
  fontSizeInput.disabled = !hasSelection;
  fontColorInput.disabled = !hasSelection;
  textEditor.disabled = !hasSelection;

  if (!hasSelection) {
    textEditor.value = "";
    return;
  }

  fontSizeInput.value = String(selected.fontSize);
  fontSizeValue.textContent = `${selected.fontSize} px`;
  fontColorInput.value = selected.color;
  textEditor.value = selected.text;
}

function updateEmptyState() {
  const hasPages = state.pageViews.length > 0;
  emptyState.hidden = hasPages;
  pageContainer.hidden = !hasPages;
}

function getSelectedTextItem() {
  return state.textItems.find((item) => item.id === state.selectedTextId) || null;
}

function getPageView(pageNumber) {
  return state.pageViews.find((pageView) => pageView.pageNumber === pageNumber) || null;
}

function setSelectedTextItem(textId) {
  state.selectedTextId = textId;

  for (const item of state.textItems) {
    if (item.element) {
      item.element.classList.toggle("selected", item.id === textId);
    }
  }

  updateSelectionControls();
}

function escapeFileName(fileName) {
  return fileName.replace(/\.pdf$/i, "");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hexColor) {
  const normalized = hexColor.replace("#", "");
  const number = Number.parseInt(normalized, 16);

  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255
  };
}

function getLines(text) {
  return text.replace(/\r/g, "").split("\n");
}

function updateTextMetrics(textItem) {
  const pageView = getPageView(textItem.pageNumber);

  if (!pageView || !textItem.textarea) {
    return;
  }

  const scaledFontSize = textItem.fontSize * pageView.scale;
  const lines = getLines(textItem.text || " ");
  measurementContext.font = `${scaledFontSize}px Helvetica, Arial, sans-serif`;

  const lineWidths = lines.map((line) => measurementContext.measureText(line || " ").width);
  const width = Math.max(...lineWidths, 72) + 22;
  const lineHeight = scaledFontSize * 1.28;
  const height = Math.max(lineHeight * lines.length + 16, scaledFontSize + 16);

  textItem.textarea.style.fontSize = `${scaledFontSize}px`;
  textItem.textarea.style.width = `${width}px`;
  textItem.textarea.style.height = `${height}px`;
  textItem.textarea.style.color = textItem.color;
}

function clampTextItemToPage(textItem) {
  const pageView = getPageView(textItem.pageNumber);

  if (!pageView || !textItem.textarea) {
    return;
  }

  const boxWidth = textItem.textarea.offsetWidth;
  const boxHeight = textItem.textarea.offsetHeight + 24;
  const maxLeft = Math.max(pageView.overlay.clientWidth - boxWidth, 0);
  const maxTop = Math.max(pageView.overlay.clientHeight - boxHeight, 0);

  textItem.pageX = clamp(textItem.pageX * pageView.scale, 0, maxLeft) / pageView.scale;
  textItem.pageY = clamp(textItem.pageY * pageView.scale, 0, maxTop) / pageView.scale;
}

function positionTextItem(textItem) {
  const pageView = getPageView(textItem.pageNumber);

  if (!pageView || !textItem.element || !textItem.textarea) {
    return;
  }

  clampTextItemToPage(textItem);

  const left = textItem.pageX * pageView.scale;
  const top = textItem.pageY * pageView.scale;

  textItem.element.style.left = `${left}px`;
  textItem.element.style.top = `${top}px`;
  textItem.element.style.color = textItem.color;
}

function syncSelectedTextEditor() {
  const selected = getSelectedTextItem();

  if (selected) {
    textEditor.value = selected.text;
  }
}

function removeTextItem(textId) {
  const index = state.textItems.findIndex((item) => item.id === textId);

  if (index === -1) {
    return;
  }

  const [removedItem] = state.textItems.splice(index, 1);
  removedItem.element?.remove();

  if (state.selectedTextId === textId) {
    state.selectedTextId = null;
  }

  setStatus("Text box removed.");
  updateSelectionControls();
}

function armAddTextMode() {
  state.addTextMode = true;
  addTextButton.textContent = "Click a Page";

  for (const pageView of state.pageViews) {
    pageView.overlay.classList.add("page-overlay--armed");
  }

  setStatus("Click anywhere on a page to place a text box.");
}

function disarmAddTextMode() {
  state.addTextMode = false;
  addTextButton.textContent = "Add Text";

  for (const pageView of state.pageViews) {
    pageView.overlay.classList.remove("page-overlay--armed");
  }
}

function createTextItem(pageNumber, pageX, pageY) {
  const newItem = {
    id: state.nextTextId,
    pageNumber,
    pageX,
    pageY,
    text: "Type here",
    fontSize: Number(fontSizeInput.value),
    color: fontColorInput.value,
    element: null,
    textarea: null
  };

  state.nextTextId += 1;
  state.textItems.push(newItem);
  mountTextItem(newItem);
  setSelectedTextItem(newItem.id);
  updateTextMetrics(newItem);
  positionTextItem(newItem);
  newItem.textarea.focus();
  newItem.textarea.select();
  setStatus("Text box added. Type directly on the page or use the editor panel.");
  return newItem;
}

function startDrag(textItem, event) {
  event.preventDefault();
  event.stopPropagation();

  const pageView = getPageView(textItem.pageNumber);

  if (!pageView) {
    return;
  }

  const startLeft = textItem.pageX * pageView.scale;
  const startTop = textItem.pageY * pageView.scale;
  const startPointerX = event.clientX;
  const startPointerY = event.clientY;

  const onPointerMove = (moveEvent) => {
    const nextLeft = startLeft + (moveEvent.clientX - startPointerX);
    const nextTop = startTop + (moveEvent.clientY - startPointerY);
    const boxWidth = textItem.textarea.offsetWidth;
    const boxHeight = textItem.textarea.offsetHeight + 24;
    const maxLeft = Math.max(pageView.overlay.clientWidth - boxWidth, 0);
    const maxTop = Math.max(pageView.overlay.clientHeight - boxHeight, 0);

    textItem.pageX = clamp(nextLeft, 0, maxLeft) / pageView.scale;
    textItem.pageY = clamp(nextTop, 0, maxTop) / pageView.scale;
    positionTextItem(textItem);
  };

  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    setStatus("Text box moved.");
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
}

function mountTextItem(textItem) {
  const pageView = getPageView(textItem.pageNumber);

  if (!pageView) {
    return;
  }

  const element = document.createElement("div");
  element.className = "text-box";
  element.dataset.textId = String(textItem.id);

  const handle = document.createElement("button");
  handle.className = "text-box__handle";
  handle.type = "button";
  handle.textContent = "Move";

  const textarea = document.createElement("textarea");
  textarea.className = "text-box__input";
  textarea.rows = 1;
  textarea.wrap = "off";
  textarea.spellcheck = false;
  textarea.value = textItem.text;
  textarea.placeholder = "Type here";

  element.append(handle, textarea);
  pageView.overlay.append(element);

  textItem.element = element;
  textItem.textarea = textarea;

  handle.addEventListener("pointerdown", (event) => startDrag(textItem, event));

  element.addEventListener("pointerdown", () => {
    setSelectedTextItem(textItem.id);
  });

  textarea.addEventListener("focus", () => {
    setSelectedTextItem(textItem.id);
  });

  textarea.addEventListener("input", () => {
    textItem.text = textarea.value;
    updateTextMetrics(textItem);
    positionTextItem(textItem);
    syncSelectedTextEditor();
  });

  updateTextMetrics(textItem);
  positionTextItem(textItem);
}

function renderTextItemsForPage(pageNumber) {
  const pageView = getPageView(pageNumber);

  if (!pageView) {
    return;
  }

  const items = state.textItems.filter((item) => item.pageNumber === pageNumber);

  for (const item of items) {
    mountTextItem(item);
    if (item.id === state.selectedTextId) {
      item.element.classList.add("selected");
    }
  }
}

async function renderDocument() {
  if (!state.pdfjsDocument) {
    return;
  }

  pageContainer.innerHTML = "";
  state.pageViews = [];

  setStatus("Rendering your PDF...");

  for (let pageNumber = 1; pageNumber <= state.pdfjsDocument.numPages; pageNumber += 1) {
    const page = await state.pdfjsDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: state.zoom });

    const pageCard = document.createElement("article");
    pageCard.className = "page-card";

    const pageLabel = document.createElement("p");
    pageLabel.className = "page-card__label";
    pageLabel.textContent = `Page ${pageNumber}`;

    const stage = document.createElement("div");
    stage.className = "page-stage";
    stage.style.width = `${viewport.width}px`;
    stage.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "page-canvas";
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const overlay = document.createElement("div");
    overlay.className = "page-overlay";

    if (state.addTextMode) {
      overlay.classList.add("page-overlay--armed");
    }

    overlay.addEventListener("pointerdown", (event) => {
      if (event.target !== overlay) {
        return;
      }

      if (!state.addTextMode) {
        setSelectedTextItem(null);
        return;
      }

      const bounds = overlay.getBoundingClientRect();
      const pageX = (event.clientX - bounds.left) / state.zoom;
      const pageY = (event.clientY - bounds.top) / state.zoom;

      createTextItem(pageNumber, pageX, pageY);
      disarmAddTextMode();
    });

    stage.append(canvas, overlay);
    pageCard.append(pageLabel, stage);
    pageContainer.append(pageCard);

    const context = canvas.getContext("2d");
    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    state.pageViews.push({
      pageNumber,
      scale: state.zoom,
      pdfWidth: viewport.width / state.zoom,
      pdfHeight: viewport.height / state.zoom,
      overlay
    });

    renderTextItemsForPage(pageNumber);
  }

  updateEmptyState();
  updateSelectionControls();
  setStatus("Your PDF is ready. Add text anywhere on the page.");
}

async function loadPdf(file) {
  setStatus("Loading PDF...");
  setDocumentMeta(`Opening ${file.name}...`);
  toggleEditorAvailability(false);
  disarmAddTextMode();
  state.textItems = [];
  state.selectedTextId = null;
  state.nextTextId = 1;
  state.pdfjsDocument = null;
  state.originalBytes = null;
  state.fileName = "";
  state.pageViews = [];
  pageContainer.innerHTML = "";
  updateEmptyState();
  updateSelectionControls();

  try {
    const buffer = await file.arrayBuffer();
    state.originalBytes = new Uint8Array(buffer);
    state.fileName = file.name;
    state.pdfjsDocument = await pdfjsLib.getDocument({
      data: state.originalBytes.slice()
    }).promise;

    toggleEditorAvailability(true);
    setDocumentMeta(`${file.name} • ${state.pdfjsDocument.numPages} page(s)`);
    await renderDocument();
  } catch (error) {
    console.error(error);
    toggleEditorAvailability(false);
    state.pageViews = [];
    pageContainer.innerHTML = "";
    updateEmptyState();
    setDocumentMeta("No file loaded yet.");
    setStatus("That PDF could not be opened. Try a different file.");
  }
}

async function downloadEditedPdf() {
  if (!state.originalBytes) {
    return;
  }

  setStatus("Building your edited PDF...");

  try {
    const pdfDoc = await PDFLib.PDFDocument.load(state.originalBytes.slice());
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    for (const textItem of state.textItems) {
      const page = pdfDoc.getPage(textItem.pageNumber - 1);
      const { r, g, b } = hexToRgb(textItem.color);
      const pageHeight = page.getHeight();
      const lineHeight = textItem.fontSize * 1.25;
      const text = textItem.text.replace(/\r/g, "");

      if (!text.trim()) {
        continue;
      }

      page.drawText(text, {
        x: textItem.pageX,
        y: pageHeight - textItem.pageY - textItem.fontSize,
        size: textItem.fontSize,
        font,
        color: PDFLib.rgb(r, g, b),
        lineHeight
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${escapeFileName(state.fileName || "document")}-edited.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus("Edited PDF downloaded.");
  } catch (error) {
    console.error(error);
    setStatus("The edited PDF could not be generated.");
  }
}

pdfUploadInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;

  if (file) {
    await loadPdf(file);
  }
});

addTextButton.addEventListener("click", () => {
  if (!state.pdfjsDocument) {
    return;
  }

  if (state.addTextMode) {
    disarmAddTextMode();
    setStatus("Add text cancelled.");
    return;
  }

  armAddTextMode();
});

deleteTextButton.addEventListener("click", () => {
  if (state.selectedTextId !== null) {
    removeTextItem(state.selectedTextId);
  }
});

fontSizeInput.addEventListener("input", () => {
  fontSizeValue.textContent = `${fontSizeInput.value} px`;
  const selected = getSelectedTextItem();

  if (!selected) {
    return;
  }

  selected.fontSize = Number(fontSizeInput.value);
  updateTextMetrics(selected);
  positionTextItem(selected);
});

fontColorInput.addEventListener("input", () => {
  const selected = getSelectedTextItem();

  if (!selected) {
    return;
  }

  selected.color = fontColorInput.value;
  updateTextMetrics(selected);
  positionTextItem(selected);
});

textEditor.addEventListener("input", () => {
  const selected = getSelectedTextItem();

  if (!selected) {
    return;
  }

  selected.text = textEditor.value;
  selected.textarea.value = selected.text;
  updateTextMetrics(selected);
  positionTextItem(selected);
});

zoomInput.addEventListener("input", () => {
  zoomValue.textContent = `${Math.round(Number(zoomInput.value) * 100)}%`;

  if (!state.pdfjsDocument) {
    return;
  }

  window.clearTimeout(state.zoomTimer);
  state.zoomTimer = window.setTimeout(async () => {
    state.zoom = Number(zoomInput.value);
    await renderDocument();
  }, 140);
});

downloadButton.addEventListener("click", async () => {
  await downloadEditedPdf();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.addTextMode) {
    disarmAddTextMode();
    setStatus("Add text cancelled.");
  }
});

toggleEditorAvailability(false);
updateSelectionControls();
updateEmptyState();
