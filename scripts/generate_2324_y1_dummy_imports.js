const XLSX = require('xlsx');
const fs = require('fs');

const srcStudents = 'c:/Users/txokei/Downloads/Grade_Deliberation_3rdYear_All.xlsx';
const outY1S1 = 'c:/Users/txokei/Downloads/Dummy_Import_2324_Y1S1.csv';
const outY1S2 = 'c:/Users/txokei/Downloads/Dummy_Import_2324_Y1S2.csv';

const wb = XLSX.readFile(srcStudents);
const srcRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

const byId = new Map();
for (const r of srcRows) {
  const id = String(r['STUDENT ID'] || '')
    .replace(/^'/, '')
    .trim();
  if (!id || byId.has(id)) continue;
  byId.set(id, {
    id,
    name: String(r.NAME || '').trim(),
    college: String(r.COLLEGE || 'College of Information Technology Education').trim(),
    course: String(
      r.COURSE || 'Bachelor of Science in Information Technology',
    ).trim(),
    gender: String(r.GENDER || 'Male').trim() || 'Male',
    admission: String(r['ADMISSION TYPE'] || 'Regular').trim() || 'Regular',
  });
}
const students = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

const y1s1Subjects = [
  ['ITE 366', 'Introduction to Computing (Including IT Fundamentals)', 'Lecture and Laboratory', 3],
  ['ITE 260', 'Computer Programming 1', 'Lecture and Laboratory', 3],
  ['GEN 002', 'Understanding the Self', 'Lecture', 3],
  ['MAT 152', 'Mathematics in the Modern World', 'Lecture', 3],
  ['GEN 001', 'Purposive Communication', 'Lecture', 3],
  ['GEN 006', 'Ethics', 'Lecture', 3],
  [
    'PED 030',
    'Physical Activities Toward Health and Fitness (PATHFIT 1): Movement Competency Training',
    'Lecture',
    2,
  ],
  ['NST 021', 'National Service Training Program 1', 'Lecture', 3],
];

const y1s2Subjects = [
  ['ITE 186', 'Computer Programming 2', 'Lecture and Laboratory', 3],
  ['ITE 048', 'Discrete Structures', 'Lecture', 3],
  ['ITE 399', 'Human Computer Interaction 1', 'Lecture and Laboratory', 3],
  ['GEN 005', 'The Contemporary World', 'Lecture', 3],
  ['GEN 008', 'Living in the IT Era', 'Lecture', 3],
  ['ART 002', 'Art Appreciation', 'Lecture', 3],
  [
    'PED 031',
    'Physical Activities Toward Health and Fitness 2 (PATHFit 2) Exercise-based Fitness Activity',
    'Lecture',
    2,
  ],
  ['NST 022', 'National Service Training Program 2', 'Lecture', 3],
];

const header = [
  'SESSION',
  'COLLEGE',
  'COURSE',
  'STUDENT ID',
  'NAME',
  'YEAR LEVEL',
  'SEMESTER',
  'CODE',
  'SUBJECT NAME',
  'SUBJECT TYPE',
  'UNITS',
  'SECTION',
  'TEACHER',
  'SSP SECTION',
  'SSP ADVISER',
  'MODALITY',
  'ENLISTMENT MODE',
  'ADMISSION TYPE',
  'GENDER',
  'P1',
  'P2',
  'P3',
  'GRADE',
  'REMARKS',
];

const passGrades = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function dummyGrade(studentId, subjectCode) {
  const h = hash(`${studentId}|${subjectCode}`);
  if (h % 100 < 8) {
    return {
      p1: 55 + (h % 10),
      p2: 50 + (h % 12),
      p3: 48 + (h % 15),
      grade: '5.00',
      remarks: 'Failed',
    };
  }
  const g = passGrades[h % passGrades.length];
  const base = Math.round((3.5 - Number(g)) * 20 + 70);
  return {
    p1: Math.min(98, base + (h % 5)),
    p2: Math.min(98, base + ((h >> 2) % 6)),
    p3: Math.min(98, base + ((h >> 4) % 5)),
    grade: g.toFixed(2),
    remarks: 'Passed',
  };
}

function sectionFor(student) {
  const n = (hash(student.id) % 8) + 1;
  const block = hash(student.id) % 2 === 0 ? 'FA1' : 'FB1';
  return `COC-${block}-BSIT1-${String(n).padStart(2, '0')}`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildFile(session, yearSem, subjects) {
  const lines = [header.map(csvEscape).join(',')];
  for (const st of students) {
    const section = sectionFor(st);
    for (const [code, title, type, units] of subjects) {
      const g = dummyGrade(st.id, `${code}|${yearSem}`);
      lines.push(
        [
          session,
          st.college,
          st.course,
          st.id,
          st.name,
          'YEAR 1',
          yearSem,
          code,
          title,
          type,
          units,
          section,
          'DUMMY FACULTY',
          '-',
          '-',
          'FLEX',
          'Regular',
          st.admission,
          st.gender,
          g.p1,
          g.p2,
          g.p3,
          g.grade,
          g.remarks,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

fs.writeFileSync(outY1S1, buildFile('SY 23-24 SEM I', 'Y1S1', y1s1Subjects), 'utf8');
fs.writeFileSync(outY1S2, buildFile('SY 23-24 SEM II', 'Y1S2', y1s2Subjects), 'utf8');

console.log(
  JSON.stringify(
    {
      students: students.length,
      y1s1: {
        path: outY1S1,
        rows: students.length * y1s1Subjects.length,
        session: 'SY 23-24 SEM I',
        subjects: y1s1Subjects.map((s) => s[0]),
      },
      y1s2: {
        path: outY1S2,
        rows: students.length * y1s2Subjects.length,
        session: 'SY 23-24 SEM II',
        subjects: y1s2Subjects.map((s) => s[0]),
      },
      sampleStudent: students[0],
    },
    null,
    2,
  ),
);
