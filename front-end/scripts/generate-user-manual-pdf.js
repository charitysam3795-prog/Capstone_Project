/**
 * Full user manual by ALL user roles — plain black text only.
 * Output: %USERPROFILE%\Downloads\Student_Evaluation_System_User_Manual.pdf
 */
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

const outPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '.',
  'Downloads',
  'Student_Evaluation_System_User_Manual.pdf'
);

const doc = new jsPDF({ unit: 'pt', format: 'letter' });
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const marginL = 54;
const marginR = 54;
const marginT = 54;
const marginB = 54;
const maxW = pageW - marginL - marginR;
let y = marginT;
let page = 1;

function setBlack() {
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
}

function footer() {
  setBlack();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Page ${page}`, pageW / 2, pageH - 28, { align: 'center' });
}

function newPage() {
  footer();
  doc.addPage();
  page += 1;
  y = marginT;
  setBlack();
}

function ensure(space) {
  if (y + space > pageH - marginB) newPage();
}

function h1(text) {
  ensure(40);
  if (y > marginT + 10) y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setBlack();
  doc.text(text, marginL, y);
  y += 8;
  doc.setLineWidth(0.6);
  doc.line(marginL, y, pageW - marginR, y);
  y += 16;
}

function h2(text) {
  ensure(28);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setBlack();
  doc.text(text, marginL, y);
  y += 15;
}

function para(text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setBlack();
  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    ensure(13);
    doc.text(line, marginL, y);
    y += 13;
  }
  y += 4;
}

function bullet(text, indent = 0) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setBlack();
  const left = marginL + 10 + indent;
  const width = maxW - 10 - indent;
  const lines = doc.splitTextToSize(text, width - 12);
  for (let i = 0; i < lines.length; i++) {
    ensure(13);
    if (i === 0) {
      doc.text('-', left, y);
      doc.text(lines[i], left + 12, y);
    } else {
      doc.text(lines[i], left + 12, y);
    }
    y += 13;
  }
}

function numbered(n, text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setBlack();
  const lines = doc.splitTextToSize(text, maxW - 18);
  for (let i = 0; i < lines.length; i++) {
    ensure(13);
    if (i === 0) doc.text(`${n}. ${lines[i]}`, marginL + 6, y);
    else doc.text(lines[i], marginL + 18, y);
    y += 13;
  }
  y += 2;
}

function canDo(items) {
  para('What this role can do:');
  items.forEach((t) => bullet(t));
}

function howTo(title, steps) {
  h2(title);
  steps.forEach((t, i) => numbered(i + 1, t));
}

// ========================= CONTENT =========================

setBlack();
doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.text('Student Evaluation System', marginL, y);
y += 24;
doc.setFontSize(13);
doc.text('User Manual — All User Roles', marginL, y);
y += 20;
doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.text('PHINMA Education — Academic Evaluation Portal', marginL, y);
y += 14;
doc.text(
  `Version date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
  marginL,
  y
);
y += 18;
para(
  'This manual covers every user role in the system: Admin, Dean, Program Head, Departmental Secretary, Evaluator (Adviser/Faculty), Student, and Guest. Each chapter lists what the role can do and how to use the main screens. Menus may also depend on extra permissions granted by Admin.'
);

h1('1. Getting started (all roles)');
bullet('Open the web application in a browser (Chrome, Edge, or Firefox recommended).');
bullet('Staff and students sign in on Login. Guests open the Guest portal without a staff account.');
bullet('After login you land on your role portal. Use the left sidebar (or student tabs) to move between modules.');
bullet('Forgot Password / email verification / first-login password change work from the login flow when enabled.');
bullet('Click Guide in the header for an on-screen walkthrough. Use Logout in the sidebar when finished.');
bullet('If a menu item is missing, ask Admin to check User permissions for your account.');

h1('2. Role overview');
para('The system has seven roles:');
bullet('Admin — system setup, users, permissions, lookup, curriculum, import, security, backup');
bullet('Dean — evaluation, curriculum tools, reports, analytics; may also receive admin modules');
bullet('Program Head — student view, curriculum view, reports, simulation / subject placement');
bullet('Departmental Secretary — add students, view records, reports, curriculum, simulation');
bullet('Evaluator (Adviser / Faculty) — manage evaluations and credit evaluation within scope');
bullet('Student — view own profile, curriculum, evaluated subjects, download PDF, simulation');
bullet('Guest — curriculum simulation and remaining-subject placement only');
para(
  'Shared evaluation rule: Regular students who pass their term can be auto-evaluated and auto-promoted when the next semester is activated. Irregular students are evaluated manually by Dean, Program Head, Secretary, or Evaluator.'
);

// -------------------- ADMIN --------------------
h1('3. Admin');
canDo([
  'Manage Users',
  'Add Student / Student Management',
  'Import Student Data via CSV / SIS (Import / Export)',
  'Manage Roles and Permissions (User permissions)',
  'Manage User Modules',
  'Manage Curriculum and Curriculum headers',
  'Manage Credit Evaluations (Subject crediting)',
  'Manage Lookup Data',
  'Manage Elective Slots',
  'Manage System Settings, Audit Logs, and Backup',
]);

h2('3.1 Portal modules');
bullet('Overview: Dashboard');
bullet('Directory and access: Lookup Data, User permissions');
bullet('Curriculum: Curriculum Management, Elective Slots');
bullet('Records and import: User Management, Student Management, Subject crediting, Import / Export');
bullet('Security: Security Settings, Audit Logs, Backup');

howTo('3.2 Manage users and permissions', [
  'Open User Management. Create or edit staff accounts and assign the correct role.',
  'Open User permissions. Grant modules such as Student Evaluation, Import / Export, Lookup Data, Curriculum, Reports, or System Management.',
  'Save changes. Ask the user to log out and back in if menus do not refresh.',
]);

howTo('3.3 Maintain Lookup Data', [
  'Open Lookup Data and choose the list (Programs, Campuses, Academic Years, Semesters, Year Levels, Departments, Subjects, and related tables).',
  'Add or edit rows. Keep campus names accurate — import campus letters are derived from these names.',
  'Activate the correct Academic Year / Semester when a new term starts (see semester activation below).',
]);

howTo('3.4 Activate a semester', [
  'Open Lookup → Semesters.',
  'Set the new semester to Active.',
  'Regular students who completed their current term may be auto-promoted. Irregular students stay for manual evaluation.',
]);

howTo('3.5 Import student / grade data', [
  'Open Import / Export and choose the import type (for example SIS Grade Deliberation).',
  'Upload CSV, Excel, or other allowed file types.',
  'Review the preview (Campus, Academic Year, Semester mapping). Campus can come from the filename letter (M = Carmen/Main, P = Puerto, I = Iligan; others follow campus names).',
  'Confirm import and wait until it finishes. Standing (Regular / Irregular) refreshes for affected students.',
  'First campus saved for a student is kept; later files do not overwrite it.',
]);

howTo('3.6 Curriculum and elective slots', [
  'Open Curriculum Management to maintain program curricula and prerequisites.',
  'Open Elective Slots to define elective groups and allowed subjects.',
  'These feed Student Evaluation for every evaluating role.',
]);

howTo('3.7 Security and backup', [
  'Use Security Settings for system controls.',
  'Use Audit Logs to review important actions.',
  'Use Backup to export / protect database copies and store them securely.',
]);

// -------------------- DEAN --------------------
h1('4. Dean');
canDo([
  'Add Student (when Student Management is permitted)',
  'Manage Curriculum (when permitted)',
  'Manage Evaluations (Student and Evaluated students)',
  'Manage Credit Evaluations / Subject crediting (when permitted)',
  'Manage Lookup Data and Elective Slots (when permitted)',
  'Generate and Download Academic Evaluation Reports (PDF)',
  'View Analytics / decision reports for programs in scope',
  'Simulate Placement of Remaining Subjects',
  'Perform Curriculum Simulation',
]);

h2('4.1 Portal modules');
bullet('Overview: Dashboard, Analytics');
bullet('Evaluation: Student, Evaluated students');
bullet('Administration (if granted): User management, Student management, Import / Export, Curriculum, Elective slots, Subject crediting, Lookup data, Security');
bullet('Account: My Profile');

howTo('4.2 Evaluate irregular students', [
  'Go to Evaluation → Student (or Evaluate a student from the dashboard).',
  'Filter Standing to Unevaluated or Unevaluated irregular. Optionally filter by Campus, Year, Program, or search.',
  'Open a student. Confirm status, units, Campus, Year, and Semester.',
  'Enter or correct grades in the curriculum table. Click Save All Changes when the save bar appears.',
  'Click Promote to next semester. Review next-term subjects, electives/track if needed, then Save.',
  'Open Subject placement to Take / Drop subjects for the term load, then Save load plan.',
  'Use Evaluated students later to review completed irregular evaluations.',
]);

howTo('4.3 Reports and analytics', [
  'From a student evaluation, generate and download the Academic Evaluation Report (PDF).',
  'Open Analytics. Choose program, academic year, semester, and year level as needed.',
  'Review standing, failed subjects, enrollment, and decision hints. Wait for large programs to finish loading.',
]);

para(
  'Tip: Use Guide in the header for a practice walkthrough of irregular evaluation. Regulars who auto-promoted usually do not need manual work.'
);

// -------------------- PROGRAM HEAD --------------------
h1('5. Program Head');
canDo([
  'Generate and Download Academic Evaluation Reports (PDF)',
  'View Student Information',
  'Simulate Placement of Remaining Subjects',
  'Perform Curriculum Simulation',
  'View Current Curriculum',
  'Participate in Student Evaluation when evaluation permissions are granted',
]);

h2('5.1 Typical portal use');
bullet('Open Evaluation → Student to view and evaluate students in your program scope.');
bullet('Use filters (Year, Standing, Campus, search) to find the student.');
bullet('Review curriculum, grades, and standing. Promote / place subjects when you have access.');
bullet('Download Academic Evaluation Reports (PDF) for advising and records.');
bullet('Open curriculum / simulation tools to plan remaining subjects without guessing loads.');
bullet('Use Guide for the irregular-evaluation walkthrough when available.');

howTo('5.2 Download a student PDF report', [
  'Open the student from Evaluation → Student.',
  'Choose Generate / Download Academic Evaluation Report (PDF).',
  'Select term options if prompted, then save the file.',
]);

// -------------------- SECRETARY --------------------
h1('6. Departmental Secretary');
canDo([
  'Add Student',
  'View Student Information',
  'Generate and Download Academic Evaluation Reports (PDF)',
  'View Current Curriculum',
  'Simulate Placement of Remaining Subjects',
  'Perform Curriculum Simulation',
  'Support evaluation workflows when Student Evaluation permission is granted',
]);

h2('6.1 Typical portal use');
bullet('Add or update students under Student management (when shown).');
bullet('Open Evaluation → Student to look up a student by ID or name.');
bullet('View curriculum progress, standing, campus, and year/semester.');
bullet('Help with promote / subject placement when authorized.');
bullet('Generate Academic Evaluation Reports (PDF) for the office.');
bullet('Use simulation / subject placement to draft remaining loads.');

howTo('6.2 Add a student', [
  'Open Student management (or Add Student entry in your portal).',
  'Enter student ID number, name, program, year level, and other required fields.',
  'Save. Confirm the student appears in Evaluation search for your department/program scope.',
]);

// -------------------- EVALUATOR --------------------
h1('7. Evaluator (Adviser / Faculty)');
canDo([
  'Manage Evaluations (within assigned program and year-level scope)',
  'Manage Credit Evaluations / Subject crediting (when permitted)',
  'View Student Information',
  'View Current Curriculum',
  'Simulate Placement of Remaining Subjects',
  'Perform Curriculum Simulation',
  'View Adviser Analytics when enabled',
]);

h2('7.1 Portal modules');
bullet('Overview: Dashboard, Analytics (if granted)');
bullet('Evaluation: Student, Evaluated students');
bullet('Subject crediting (if granted)');
bullet('Account: My Profile');

howTo('7.2 Daily evaluation workflow', [
  'Open Evaluation → Student.',
  'Focus on Unevaluated irregular (or Unevaluated). Your list is limited to assigned year levels / program.',
  'Open the student. Review grades. With Promote-only access, grades may be read-only.',
  'If you can edit grades, save changes with Save All Changes.',
  'Promote irregulars manually and complete Subject placement (Take / Drop) within unit limits.',
  'Check Evaluated students to confirm the record was stored.',
]);

howTo('7.3 Subject crediting', [
  'Open Subject crediting.',
  'Select the student and map external / prior subjects to local equivalents.',
  'Approve credits as permitted so they appear on the evaluation curriculum.',
]);

para(
  'Tip: Regulars who already auto-promoted after semester activation usually leave the unevaluated list. Spend time on irregulars and incomplete loads.'
);

// -------------------- STUDENT --------------------
h1('8. Student');
canDo([
  'View Profile',
  'View Evaluated Subjects',
  'View Student Information',
  'View Current Curriculum',
  'Generate and Download Academic Evaluation Reports (PDF)',
  'Simulate Placement of Remaining Subjects',
  'Perform Curriculum Simulation',
]);

h2('8.1 Portal tabs');
bullet('Dashboard — home summary, term shortcuts');
bullet('My Profile — personal and contact details');
bullet('My Curriculum — program subjects, status, remaining requirements / evaluated progress');

howTo('8.2 View your progress', [
  'Sign in with your student account.',
  'Open Dashboard for an overview of your term and shortcuts.',
  'Open My Curriculum to see subjects, grades/status, and remaining requirements.',
  'Open My Profile to review or update allowed personal details.',
]);

howTo('8.3 Download your evaluation PDF', [
  'Open your academic evaluation / curriculum view.',
  'Choose Generate / Download Academic Evaluation Report (PDF).',
  'Save the file for your records or advising meeting.',
]);

howTo('8.4 Simulation / remaining subjects', [
  'Open the simulation or subject-placement tool when available in your portal.',
  'Mark remaining subjects and review suggested loads / remaining semesters.',
  'Use this for planning only unless staff tell you a plan was officially saved.',
]);

para(
  'Students do not edit official staff evaluations. For standing or grade questions, contact your Dean, Program Head, Secretary, or Adviser.'
);

// -------------------- GUEST --------------------
h1('9. Guest');
canDo([
  'Simulate Placement of Remaining Subjects',
  'Perform Curriculum Simulation',
]);
para(
  'Guests do not manage live student records, imports, user accounts, or official grades. The Guest portal is for curriculum planning and what-if placement.'
);

howTo('9.1 Run a curriculum simulation', [
  'Open the Guest portal (no staff login required for guest simulation).',
  'Choose the program / curriculum.',
  'Mark subjects already taken and subjects still remaining as the screen instructs.',
  'Review credited units, lacking units, remaining years/semesters, and load limits.',
  'Adjust Take / Drop style placement until the plan looks correct.',
  'Download or print the simulation output if the screen offers PDF/export.',
]);

h1('10. Shared notes for evaluating roles');
para('Applies to Dean, Program Head, Departmental Secretary, and Evaluator when they evaluate students:');
bullet('Campus on the student card can be set or corrected from Lookup campuses (with confirmation).');
bullet('Year / Semester can be updated with promote/demote confirmation when permitted.');
bullet('Filters: Program, Campus, Year, Standing, search — use them before acting on long lists.');
bullet('Large imports and analytics may take longer; wait for the success or finished state.');
bullet('Practice / [Practice] SIMULATION students are for Guide and training; do not treat them as live records.');

h1('11. Quick permission checklist');
bullet('Admin: full system modules by default.');
bullet('Dean: evaluation + reports + analytics; admin modules only if granted.');
bullet('Program Head: view students/curriculum, reports, simulation; evaluation if granted.');
bullet('Secretary: add/view students, reports, curriculum, simulation; evaluation if granted.');
bullet('Evaluator: evaluation and optional subject crediting within assigned scope.');
bullet('Student: own profile, curriculum, PDF, simulation.');
bullet('Guest: simulation only.');

y += 8;
para('End of User Manual — All User Roles.');
para('For access problems, contact your campus Admin or Academic Evaluation administrator.');

footer();

const buf = Buffer.from(doc.output('arraybuffer'));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
console.log(outPath);
