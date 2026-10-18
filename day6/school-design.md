
# School Database Design

## Tables

### Students
The students table stores each student's unique ID, full name and email address. The student ID is the primary key, and the email is required and unique so that two students cannot register with the same email.

### Courses
The courses table stores each course's unique ID and name. The course ID is the primary key, and the course name is required.

### Enrolments
The enrolments table records which student takes which course and the grade they receive. It has its own primary key and foreign keys referencing students and courses. A UNIQUE constraint on student_id and course_id prevents a student from enrolling in the same course twice.

## Relationships

Students and enrolments have a one-to-many relationship because one student can have multiple enrolment records. Courses and enrolments also have a one-to-many relationship because one course can have multiple students enrolled.

Students and courses therefore have a many-to-many relationship: each student can take several courses, and each course can contain several students. The enrolments table is necessary to connect these tables and store details specific to each enrolment, such as the student's grade.

## Index

I would add an index on `enrolments(course_id)` to speed up searches for students enrolled in a particular course and queries that count enrolments by course. The UNIQUE constraint on `(student_id, course_id)` already creates an index for that column combination in SQLite.

## SQL or NoSQL?

I would choose a relational SQL database such as SQLite for this school system. Students, courses and enrolments have clear relationships, and foreign keys help maintain data integrity. SQL joins make it straightforward to retrieve course lists, student lists and enrolment counts. The unique constraint also prevents duplicate enrolments. A NoSQL database could work, but SQL is a more natural fit for this structured, relationship-based data.
