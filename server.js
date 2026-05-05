const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const path = require("path");

const app = express();
const port = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

app.use(express.static(path.join(__dirname, "public")));

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isMeaningfulText(text) {
  return (text || "").replace(/\s+/g, " ").trim().length > 80;
}

function cleanOutlineLabel(label) {
  return label
    .replace(/^chapter\s+\d+[:.\-]?\s*/i, "")
    .replace(/\bchapter\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 10) {
    return false;
  }

  if (/[.!?]$/.test(trimmed)) {
    return false;
  }

  if (trimmed.length < 8 || trimmed.length > 72) {
    return false;
  }

  const hasMostlyLetters = /^[A-Za-z0-9 ,:/()\-]+$/.test(trimmed);
  if (!hasMostlyLetters) {
    return false;
  }

  const uppercaseWords = words.filter((word) => word === word.toUpperCase()).length;
  const titleCaseWords = words.filter((word) => /^[A-Z][a-z0-9].*/.test(word)).length;

  return uppercaseWords >= Math.ceil(words.length * 0.7) || titleCaseWords >= Math.ceil(words.length * 0.8);
}

async function extractWithPdfParse(buffer) {
  if (process.env.VERCEL) {
    throw new Error("pdf-parse disabled in Vercel runtime");
  }

  // Lazy-load so unsupported runtimes do not crash at cold start.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const pdfParse = require("pdf-parse");
  const parsed = await pdfParse(buffer);
  return [{ pageNumber: 1, text: parsed.text || "" }];
}

async function extractWithPdfJs(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const rows = [];

    for (const item of textContent.items) {
      if (!("str" in item)) {
        continue;
      }
      const value = (item.str || "").trim();
      if (!value) {
        continue;
      }
      const y = typeof item.transform?.[5] === "number" ? item.transform[5] : 0;
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(lastRow.y - y) < 2) {
        lastRow.parts.push(value);
      } else {
        rows.push({ y, parts: [value] });
      }
    }

    const pageText = rows
      .map((row) => row.parts.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");

    pages.push({ pageNumber, text: pageText });
  }

  return pages;
}

async function extractFromDocx(buffer) {
  const extracted = await mammoth.extractRawText({ buffer });
  const chunks = extracted.value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const pages = [];
  const chunkSize = 18;
  for (let i = 0; i < chunks.length; i += chunkSize) {
    pages.push({
      pageNumber: Math.floor(i / chunkSize) + 1,
      text: chunks.slice(i, i + chunkSize).join("\n"),
    });
  }

  return pages.length ? pages : [{ pageNumber: 1, text: extracted.value || "" }];
}

async function extractPagesFromPdf(buffer) {
  let firstError;

  try {
    const pages = await extractWithPdfParse(buffer);
    const combinedText = pages.map((page) => page.text).join("\n");
    if (isMeaningfulText(combinedText)) {
      return pages;
    }
  } catch (error) {
    firstError = error;
  }

  try {
    const pages = await extractWithPdfJs(buffer);
    const combinedText = pages.map((page) => page.text).join("\n");
    if (isMeaningfulText(combinedText)) {
      return pages;
    }
  } catch (fallbackError) {
    const reason = fallbackError?.message || firstError?.message || "Unknown parser error.";
    throw new Error(`PARSE_ERROR:${reason}`);
  }

  throw new Error("NO_TEXT:No selectable text found. This PDF may be scanned images only.");
}

function buildDisplaySections(pages) {
  const sections = [];
  let buffer = [];
  let wordCount = 0;

  const flush = () => {
    if (!buffer.length) {
      return;
    }
    sections.push({
      sectionNumber: sections.length + 1,
      pageRange: [buffer[0].pageNumber, buffer[buffer.length - 1].pageNumber],
      text: buffer.map((page) => page.text).join("\n"),
    });
    buffer = [];
    wordCount = 0;
  };

  for (const page of pages) {
    const pageWords = page.text.split(/\s+/).filter(Boolean).length;
    buffer.push(page);
    wordCount += pageWords;

    if (wordCount >= 240 || buffer.length >= 3) {
      flush();
    }
  }
  flush();

  return sections.length
    ? sections
    : [{ sectionNumber: 1, pageRange: [1, 1], text: pages.map((page) => page.text).join("\n") }];
}

function toDocumentationHtmlBySection(sections, parseMode = "strict") {
  const outline = [];
  const sectionHtml = sections.map((section) => {
    const lines = section.text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const chunks = [];
    let paragraph = [];

    const flushParagraph = () => {
      if (paragraph.length) {
        chunks.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
        paragraph = [];
      }
    };

    for (const line of lines) {
      const isLikelyHeading = parseMode === "strict" ? isLikelyHeadingLine(line) : false;

      if (isLikelyHeading) {
        flushParagraph();
        const outlineLabel = cleanOutlineLabel(line);
        if (outlineLabel) {
          const sectionId = `section-${section.sectionNumber}-heading-${outline.length + 1}`;
          outline.push({
            id: sectionId,
            label: outlineLabel,
          });
          chunks.push(`<h4 id="${sectionId}">${escapeHtml(outlineLabel)}</h4>`);
        }
      } else {
        paragraph.push(line);
      }
    }
    flushParagraph();

    if (!chunks.length) {
      chunks.push("<p>No readable text found on this page.</p>");
    }

    return [
      `<section id="section-${section.sectionNumber}" class="doc-page">`,
      `<header class="doc-page-header"><h3>Section ${section.sectionNumber}</h3></header>`,
      `<div class="doc-page-content">${chunks.join("\n")}</div>`,
      "</section>",
    ].join("\n");
  });

  return { contentHtml: sectionHtml.join("\n"), outline };
}

app.post("/api/convert", upload.single("document"), async (req, res) => {
  try {
    if (!req.file || !req.file.originalname) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const parseMode = req.body?.parseMode === "flow" ? "flow" : "strict";
    const ocrEnabled = req.body?.ocrEnabled === "true";

    const extension = path.extname(req.file.originalname).toLowerCase();
    let pages;
    if (extension === ".pdf") {
      pages = await extractPagesFromPdf(req.file.buffer);
    } else if (extension === ".docx") {
      pages = await extractFromDocx(req.file.buffer);
    } else {
      return res.status(400).json({ error: "Only .pdf and .docx are supported." });
    }

    const sections = buildDisplaySections(pages);
    const { contentHtml, outline } = toDocumentationHtmlBySection(sections, parseMode);
    const toc = outline.length
      ? outline
      : sections.map((section) => ({
          id: `section-${section.sectionNumber}`,
          label: `Section ${section.sectionNumber}`,
        }));

    return res.json({
      title: req.file.originalname.replace(/\.(pdf|docx)$/i, ""),
      pageCount: sections.length,
      toc,
      contentHtml,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("PDF conversion failed:", error);
    const reason = String(error?.message || "Unknown parser error");
    if (reason.startsWith("NO_TEXT:") || reason.startsWith("PARSE_ERROR:")) {
      return res.json({
        title: req.file.originalname.replace(/\.pdf$/i, ""),
        pageCount: 0,
        toc: [],
        warning: ocrEnabled
          ? "OCR fallback is enabled, but local OCR is not configured in this build. Showing placeholder view."
          : "This file appears to be scanned/protected or has no selectable text. Showing a placeholder view.",
        contentHtml:
          "<p><strong>No extractable text was found.</strong></p><p>This usually means the PDF is made of images (scanned pages) or is protected.</p>",
      });
    }

    return res.status(500).json({
      error: `Could not parse this PDF: ${reason}`,
    });
  }
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Local doc reader running at http://localhost:${port}`);
  });
}
