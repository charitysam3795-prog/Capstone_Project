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
  "testing-plan-registry.canvas.tsx",
);
const outputPath = path.join(workspaceRoot, "Testing-Plan-Registry.docx");

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
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
      }
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
      if (depth === 0) {
        return source.slice(arrayStart, i + 1);
      }
    }
  }
  throw new Error(`Array end not found for ${constName}`);
}

function parseRows(source, constName) {
  const literal = extractArrayLiteral(source, constName);
  return vm.runInNewContext(literal, {});
}

function textCell(value, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(value ?? ""), bold, size: 20 })],
      }),
    ],
  });
}

function buildTable(headers, rows) {
  const tableRows = [];
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map((h) => textCell(h, true)),
    }),
  );
  for (const row of rows) {
    tableRows.push(
      new TableRow({
        children: headers.map((_, idx) => textCell(row[idx] ?? "")),
      }),
    );
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

function blankLine() {
  return new Paragraph({ text: "" });
}

const source = fs.readFileSync(canvasPath, "utf8");
const moduleRows = parseRows(source, "moduleRows");
const unitRows = parseRows(source, "unitRows");
const integrationRows = parseRows(source, "integrationRows");
const systemRows = parseRows(source, "systemRows");
const missingRows = parseRows(source, "missingRows");

const children = [
  new Paragraph({
    text: "Capstone Testing Plan Registry",
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({
    children: [
      new TextRun({
        text: "Generated from testing-plan-registry.canvas.tsx",
        italics: true,
        size: 20,
      }),
    ],
    alignment: AlignmentType.CENTER,
  }),
  blankLine(),
  new Paragraph({
    text: "1) Implemented Modules and Features",
    heading: HeadingLevel.HEADING_1,
  }),
  buildTable(["Module ID", "Module", "Implemented Features", "User Scope", "Layers"], moduleRows),
  blankLine(),
  new Paragraph({
    text: "2) Unit Test Cases",
    heading: HeadingLevel.HEADING_1,
  }),
  buildTable(
    [
      "Test ID",
      "Module",
      "Feature/Function",
      "Test Scenario",
      "Test Steps",
      "Test Data/Input",
      "Expected Result",
      "Actual Result",
      "Status",
    ],
    unitRows,
  ),
  blankLine(),
  new Paragraph({
    text: "3) Integration Test Cases",
    heading: HeadingLevel.HEADING_1,
  }),
  buildTable(
    [
      "Test ID",
      "Module",
      "Feature/Function",
      "Test Scenario",
      "Test Steps",
      "Test Data/Input",
      "Expected Result",
      "Actual Result",
      "Status",
    ],
    integrationRows,
  ),
  blankLine(),
  new Paragraph({
    text: "4) System Test Cases",
    heading: HeadingLevel.HEADING_1,
  }),
  buildTable(
    [
      "Test ID",
      "Module",
      "Feature/Function",
      "Test Scenario",
      "Test Steps",
      "Test Data/Input",
      "Expected Result",
      "Actual Result",
      "Status",
    ],
    systemRows,
  ),
  blankLine(),
  new Paragraph({
    text: "Missing or Unimplemented Features",
    heading: HeadingLevel.HEADING_1,
  }),
  buildTable(
    ["Missing ID", "Feature", "Observation"],
    missingRows,
  ),
];

const doc = new Document({
  sections: [{ properties: {}, children }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`Created: ${outputPath}`);

