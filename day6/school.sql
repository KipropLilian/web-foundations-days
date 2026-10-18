
PRAGMA foreign_keys = ON;

-- Remove existing tables so the script can be rerun safely.
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. Students table
CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- 2. Courses table
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    course_name TEXT NOT NULL UNIQUE
);

-- 3. Enrolments links students and courses.
-- A student can enrol in many courses, and each course
-- can have many students.
CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (course_id) REFERENCES courses(course_id),
    UNIQUE (student_id, course_id)
);

-- Sample students
INSERT INTO students (student_id, full_name, email) VALUES
(1, 'Amina Hassan', 'amina@example.com'),
(2, 'Brian Otieno', 'brian@example.com'),
(3, 'Carol Wanjiku', 'carol@example.com'),
(4, 'David Kiptoo', 'david@example.com');

-- Sample courses
INSERT INTO courses (course_id, course_name) VALUES
(1, 'Database Systems'),
(2, 'Web Development'),
(3, 'Computer Networks');

-- Sample enrolments
INSERT INTO enrolments
    (enrolment_id, student_id, course_id, grade)
VALUES
(1, 1, 1, 'A'),
(2, 1, 2, 'B'),
(3, 2, 1, 'B'),
(4, 3, 2, 'A'),
(5, 3, 3, 'B');

-- QUERY 1: All courses taken by one student (Amina Hassan)
SELECT
    s.full_name,
    c.course_name,
    e.grade
FROM students AS s
JOIN enrolments AS e ON s.student_id = e.student_id
JOIN courses AS c ON e.course_id = c.course_id
WHERE s.full_name = 'Amina Hassan';

-- QUERY 2: All students enrolled in Database Systems
SELECT
    s.full_name,
    s.email,
    c.course_name
FROM students AS s
JOIN enrolments AS e ON s.student_id = e.student_id
JOIN courses AS c ON e.course_id = c.course_id
WHERE c.course_name = 'Database Systems';

-- QUERY 3: Number of students enrolled in each course
SELECT
    c.course_name,
    COUNT(e.student_id) AS student_count
FROM courses AS c
LEFT JOIN enrolments AS e ON c.course_id = e.course_id
GROUP BY c.course_id, c.course_name
ORDER BY c.course_name;

-- QUERY 4: Students who have no enrolments
SELECT
    s.student_id,
    s.full_name,
    s.email
FROM students AS s
LEFT JOIN enrolments AS e ON s.student_id = e.student_id
WHERE e.student_id IS NULL;

-- QUERY 5: Update one enrolment's grade
UPDATE enrolments
SET grade = 'A'
WHERE student_id = 2 AND course_id = 1;

-- Verify the grade update
SELECT
    s.full_name,
    c.course_name,
    e.grade
FROM enrolments AS e
JOIN students AS s ON e.student_id = s.student_id
JOIN courses AS c ON e.course_id = c.course_id
WHERE s.student_id = 2 AND c.course_id = 1;
