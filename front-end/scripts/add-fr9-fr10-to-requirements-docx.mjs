import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const sourceDocx =
  process.argv[2] ||
  'c:\\Users\\txokei\\Downloads\\Functional and non fucntional.docx';
const outputDocx =
  process.argv[3] ||
  'c:\\Users\\txokei\\Downloads\\Functional and non fucntional.docx';

const workDir = path.join('c:\\capstone_project\\docs', '_docx_fr9_fr10');
const extractDir = path.join(workDir, 'docx_root');
const xmlPath = path.join(extractDir, 'word', 'document.xml');

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(text, paraId) {
  const value = escapeXml(text);
  return `<w:tc><w:tcPr/><w:p w:rsidR="00000000" w:rsidDel="00000000" w:rsidP="00000000" w:rsidRDefault="00000000" w:rsidRPr="00000000" w14:paraId="${paraId}"><w:pPr><w:spacing w:after="160" w:line="278.00000000000006" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:pPr><w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000"><w:rPr><w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${value}</w:t></w:r></w:p></w:tc>`;
}

function requirementRow(cells, rowSuffix) {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
  return `<w:tr>${cells
    .map((text, index) => cell(text, `FR${rowSuffix}${ids[index]}`))
    .join('')}</w:tr>`;
}

const fr09 = requirementRow(
  [
    'FR-09',
    'Analytics and Reports',
    'Generate Decision-Driven Academic Analytics',
    'Dean / Program Head / Evaluator / Adviser',
    'The system shall generate decision-driven academic analytics based on student grades, curriculum progress, evaluation results, and program filters so authorized users can identify who needs intervention and what action to take next.',
    'Student profiles, grades, curriculum data, academic status, program, year level, semester filters, and evaluation completion data',
    'The system summarizes regular and irregular students, at-risk students, high-fail subjects, pass and fail rates, lacking units, evaluation backlog, and entry-type distribution. Each metric includes a recommended next action such as opening filtered student evaluation or review lists.',
    'Analytics dashboard, summary counts, charts, at-risk lists, and decision-oriented reports',
    'Student records, grades, and curriculum data must already exist in the system. The user must be logged in and authorized to view analytics.',
    'Authorized users can use analytics to support advising, evaluation prioritization, curriculum review, and academic monitoring.',
    'High',
  ],
  '09',
);

const fr10 = requirementRow(
  [
    'FR-10',
    'Academic Data Import Management',
    'Import and Update Academic Records',
    'Admin / Dean / Authorized Staff',
    'The system shall allow authorized users to import academic data from CSV files to create or update student profiles and record or update student grades, including preview validation and row-level correction before import.',
    'CSV file containing academic record data such as Session, Course, Student ID, Name, Year Level, Subject Code, Subject Name, Units, Grade, and Remarks',
    'The system validates CSV headers and row values, previews valid and invalid rows, allows Fix row correction for mismatched subject codes, term, program, year level, or missing values, then creates missing student profiles and records or updates grade entries.',
    'Imported student profiles, updated student records, recorded grade entries, and import summary results',
    'The user must be logged in and authorized. Program, curriculum, subject, academic year, and semester records must exist or be resolvable by the system.',
    'Imported academic records become available for student evaluation, analytics, and curriculum tracking.',
    'High',
  ],
  '10',
);

fs.mkdirSync(workDir, { recursive: true });
const zipCopy = path.join(workDir, 'source.zip');
fs.copyFileSync(sourceDocx, zipCopy);
if (fs.existsSync(extractDir)) {
  fs.rmSync(extractDir, { recursive: true, force: true });
}
fs.mkdirSync(extractDir, { recursive: true });
execSync(
  `powershell -NoProfile -Command "Expand-Archive -Path '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' },
);

let xml = fs.readFileSync(xmlPath, 'utf8');
if (/<w:t[^>]*>FR-09<\/w:t>/.test(xml)) {
  console.error('Document already contains functional requirement FR-09. No changes made.');
  process.exit(1);
}

const marker =
  'without affecting actual student records.</w:t></w:r></w:p></w:tc><w:tc><w:tcPr/><w:p';
const markerIndex = xml.indexOf(marker);
if (markerIndex < 0) {
  console.error('Could not find FR-08 row marker in document.xml');
  process.exit(1);
}

const rowEnd = xml.indexOf('</w:tr>', markerIndex);
if (rowEnd < 0) {
  console.error('Could not find end of FR-08 row');
  process.exit(1);
}

const insertAt = rowEnd + '</w:tr>'.length;
xml = `${xml.slice(0, insertAt)}${fr09}${fr10}${xml.slice(insertAt)}`;
fs.writeFileSync(xmlPath, xml, 'utf8');

const outZip = path.join(workDir, 'updated.zip');
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
const items = ['[Content_Types].xml', '_rels', 'word', 'docProps']
  .filter((name) => fs.existsSync(path.join(extractDir, name)))
  .map((name) => `'${path.join(extractDir, name).replace(/'/g, "''")}'`)
  .join(',');
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path ${items} -DestinationPath '${outZip.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' },
);

fs.copyFileSync(outZip, outputDocx);
console.log(`Updated document written to: ${outputDocx}`);
