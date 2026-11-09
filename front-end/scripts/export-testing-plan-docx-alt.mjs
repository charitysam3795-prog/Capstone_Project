import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const workspaceRoot = "c:\\capstone_project";
const canvasPath = path.join(
  "c:\\Users\\txokei\\.cursor\\projects\\c-capstone-project\\canvases",
  "testing-plan-registry-alt.canvas.tsx",
);
const outputPath = path.join(workspaceRoot, "Testing-Plan-Registry-Alt.docx");

function extractArrayLiteral(source, constName) {
  const marker = `const ${constName} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${constName}`);
  const from = start + marker.length;
  let i = from;
  while (i < source.length && source[i] !== "[") i += 1;
  if (i >= source.length) throw new Error(`Array start not found for ${constName}`);
  const arrayStart = i;
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === stringQuote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(arrayStart, i + 1);
    }
  }
  throw new Error(`Array end not found for ${constName}`);
}

function parseRows(source, constName) {
  return vm.runInNewContext(extractArrayLiteral(source, constName), {});
}

function textCell(value, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(value ?? ""), bold, size: 20 })] })],
  });
}

function buildTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h) => textCell(h, true)) }),
      ...rows.map((row) => new TableRow({ children: headers.map((_, idx) => textCell(row[idx] ?? "")) })),
    ],
  });
}

const source = fs.readFileSync(canvasPath, "utf8");
const moduleRows = parseRows(source, "moduleRows");
const unitRows = parseRows(source, "unitRows");
const integrationRows = parseRows(source, "integrationRows");
const systemRows = parseRows(source, "systemRows");
const missingRows = parseRows(source, "missingRows");

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          text: "Software Testing Plan (Variant B: Implemented-Only)",
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: "Generated from testing-plan-registry-alt.canvas.tsx", italics: true, size: 20 })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Implemented Modules and Features", heading: HeadingLevel.HEADING_1 }),
        buildTable(["Module ID", "Module", "Implemented Features", "User Scope", "Code Evidence"], moduleRows),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "1) Unit Testing", heading: HeadingLevel.HEADING_1 }),
        buildTable(
          ["Test ID", "Module", "Feature/Function", "Test Scenario", "Test Steps", "Test Data/Input", "Expected Result", "Actual Result", "Status"],
          unitRows,
        ),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "2) Integration Testing", heading: HeadingLevel.HEADING_1 }),
        buildTable(
          ["Test ID", "Module", "Feature/Function", "Test Scenario", "Test Steps", "Test Data/Input", "Expected Result", "Actual Result", "Status"],
          integrationRows,
        ),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "3) System Testing", heading: HeadingLevel.HEADING_1 }),
        buildTable(
          ["Test ID", "Module", "Feature/Function", "Test Scenario", "Test Steps", "Test Data/Input", "Expected Result", "Actual Result", "Status"],
          systemRows,
        ),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "Missing or Unimplemented Features", heading: HeadingLevel.HEADING_1 }),
        buildTable(["Missing ID", "Feature", "Observation"], missingRows),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`Created: ${outputPath}`);

