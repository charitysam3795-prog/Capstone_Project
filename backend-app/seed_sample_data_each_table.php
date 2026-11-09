<?php
declare(strict_types=1);

$pdo = new PDO('mysql:host=127.0.0.1;port=3307;dbname=capstone_app;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

function countRows(PDO $pdo, string $table): int {
    return (int)$pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
}

function firstId(PDO $pdo, string $table, string $idCol): ?int {
    $v = $pdo->query("SELECT `{$idCol}` FROM `{$table}` ORDER BY `{$idCol}` ASC LIMIT 1")->fetchColumn();
    return $v === false ? null : (int)$v;
}

function ensureUserForRole(PDO $pdo, int $roleId, string $email): int {
    $q = $pdo->prepare("SELECT user_id FROM tbl_users WHERE role_id = :r ORDER BY user_id LIMIT 1");
    $q->execute([':r' => $roleId]);
    $id = $q->fetchColumn();
    if ($id !== false) return (int)$id;

    $ins = $pdo->prepare("
        INSERT INTO tbl_users (email, password, contact_number, role_id, status)
        VALUES (:email, :pw, :contact, :role_id, 'active')
    ");
    $ins->execute([
        ':email' => $email,
        ':pw' => password_hash('sample123', PASSWORD_BCRYPT),
        ':contact' => '09170000000',
        ':role_id' => $roleId,
    ]);
    return (int)$pdo->lastInsertId();
}

$pdo->beginTransaction();
try {
    $nowTs = time();
    $today = date('Y-m-d');

    $programId = firstId($pdo, 'tbl_program', 'program_id');
    $semesterId = firstId($pdo, 'tbl_semester', 'semester_id');
    $yearLevelId = firstId($pdo, 'year_level', 'year_level_id');
    $subjectId = firstId($pdo, 'tbl_subjects', 'subject_id');
    $subject2Id = (int)($pdo->query("SELECT subject_id FROM tbl_subjects ORDER BY subject_id ASC LIMIT 1 OFFSET 1")->fetchColumn() ?: $subjectId);
    $academicYearId = firstId($pdo, 'tbl_academic_year', 'academic_year_id');
    $trackId = firstId($pdo, 'tbl_track', 'track_id');
    $departmentId = firstId($pdo, 'tbl_departments', 'department_id');

    $studentRoleId = (int)($pdo->query("SELECT role_id FROM tbl_roles WHERE role_name='Student' LIMIT 1")->fetchColumn() ?: 2);
    $facultyRoleId = (int)($pdo->query("SELECT role_id FROM tbl_roles WHERE role_name='Faculty' LIMIT 1")->fetchColumn() ?: 3);
    $adminRoleId = (int)($pdo->query("SELECT role_id FROM tbl_roles WHERE role_name='Admin' LIMIT 1")->fetchColumn() ?: 1);

    $adminUserId = (int)($pdo->query("SELECT user_id FROM tbl_users WHERE role_id = {$adminRoleId} ORDER BY user_id LIMIT 1")->fetchColumn() ?: 1);
    $studentUserId = ensureUserForRole($pdo, $studentRoleId, 'sample.student@example.com');
    $facultyUserId = ensureUserForRole($pdo, $facultyRoleId, 'sample.faculty@example.com');

    if (countRows($pdo, 'cache') === 0) {
        $pdo->prepare("INSERT INTO cache (`key`,`value`,`expiration`) VALUES ('sample:cache','sample-value',:exp)")
            ->execute([':exp' => $nowTs + 3600]);
    }
    if (countRows($pdo, 'cache_locks') === 0) {
        $pdo->prepare("INSERT INTO cache_locks (`key`,`owner`,`expiration`) VALUES ('sample:lock','seed-script',:exp)")
            ->execute([':exp' => $nowTs + 120]);
    }
    if (countRows($pdo, 'password_reset_tokens') === 0) {
        $pdo->prepare("INSERT INTO password_reset_tokens (`email`,`token`,`created_at`) VALUES ('sample.reset@example.com','sample-token',NOW())")->execute();
    }
    if (countRows($pdo, 'jobs') === 0) {
        $pdo->prepare("INSERT INTO jobs (`queue`,`payload`,`attempts`,`available_at`,`created_at`) VALUES ('default','{\"sample\":true}',0,:ts,:ts)")
            ->execute([':ts' => $nowTs]);
    }
    if (countRows($pdo, 'job_batches') === 0) {
        $pdo->prepare("INSERT INTO job_batches (`id`,`name`,`total_jobs`,`pending_jobs`,`failed_jobs`,`failed_job_ids`,`options`,`created_at`) VALUES ('sample-batch','Sample Batch',1,0,0,'[]',NULL,:ts)")
            ->execute([':ts' => $nowTs]);
    }
    if (countRows($pdo, 'failed_jobs') === 0) {
        $pdo->prepare("INSERT INTO failed_jobs (`uuid`,`connection`,`queue`,`payload`,`exception`,`failed_at`) VALUES ('sample-failed-job-uuid','database','default','{\"sample\":true}','Sample exception',NOW())")->execute();
    }

    if (countRows($pdo, 'tbl_permission') === 0) {
        $pdo->prepare("INSERT INTO tbl_permission (`permission_name`,`category`,`description`) VALUES ('Sample Module Access','System','Sample permission row')")->execute();
    }
    $permissionId = firstId($pdo, 'tbl_permission', 'permission_id');
    if (countRows($pdo, 'tbl_role_permissions') === 0 && $permissionId && $adminRoleId) {
        $pdo->prepare("INSERT INTO tbl_role_permissions (`role_id`,`permission_id`) VALUES (:r,:p)")
            ->execute([':r' => $adminRoleId, ':p' => $permissionId]);
    }

    if (countRows($pdo, 'tbl_schools') === 0) {
        $pdo->prepare("INSERT INTO tbl_schools (`school_name`,`school_program`,`school_curriculum`) VALUES ('Sample University','BSIT','2024 Curriculum')")->execute();
    }
    $schoolId = firstId($pdo, 'tbl_schools', 'school_id');

    if (countRows($pdo, 'tbl_other_school_subjects') === 0 && $schoolId) {
        $pdo->prepare("INSERT INTO tbl_other_school_subjects (`school_id`,`subject_code`,`subject_name`,`units`,`hours`,`description`) VALUES (:sid,'SAMP101','Sample External Subject',3,54,'Sample transfer subject')")
            ->execute([':sid' => $schoolId]);
    }
    $otherSubjectId = firstId($pdo, 'tbl_other_school_subjects', 'other_subject_id');

    if (countRows($pdo, 'tbl_student_profile') === 0) {
        $pdo->prepare("
            INSERT INTO tbl_student_profile
            (`user_id`,`student_number`,`first_name`,`middle_name`,`last_name`,`address`,`contact_number`,`academic_status`,`year_level_id`,`track_id`,`current_program`)
            VALUES
            (:uid,900001,'Sample','A','Student','Sample Address','09171111111','active',:yl,:tr,:pg)
        ")->execute([
            ':uid' => $studentUserId,
            ':yl' => $yearLevelId,
            ':tr' => $trackId,
            ':pg' => $programId,
        ]);
    }
    $studentId = firstId($pdo, 'tbl_student_profile', 'student_id');

    if (countRows($pdo, 'tbl_faculty_profile') === 0) {
        $pdo->prepare("
            INSERT INTO tbl_faculty_profile
            (`user_id`,`first_name`,`middle_name`,`last_name`,`employee_id`,`department_id`,`specialization`)
            VALUES
            (:uid,'Sample','B','Faculty','EMP-1001',:dept,'Advising')
        ")->execute([':uid' => $facultyUserId, ':dept' => $departmentId]);
    }

    if (countRows($pdo, 'tbl_curriculum_header') === 0 && $programId) {
        $pdo->prepare("INSERT INTO tbl_curriculum_header (`program_id`,`Effective_Year`,`description`) VALUES (:pg,2026,'Sample curriculum header')")
            ->execute([':pg' => $programId]);
    }
    if (countRows($pdo, 'tbl_prerequisite') === 0 && $subjectId && $subject2Id) {
        $pdo->prepare("INSERT INTO tbl_prerequisite (`subject_id`,`requisite_type`,`requisites_subject_id`) VALUES (:s1,'Prerequisite',:s2)")
            ->execute([':s1' => $subject2Id, ':s2' => $subjectId]);
    }

    if (countRows($pdo, 'tbl_offered_subject') === 0 && $subjectId && $academicYearId && $semesterId && $programId) {
        $pdo->prepare("
            INSERT INTO tbl_offered_subject
            (`subject_id`,`academic_year_id`,`semester_id`,`program_id`,`track_id`,`year_level_id`,`status`)
            VALUES
            (:sub,:ay,:sem,:pg,:tr,:yl,'active')
        ")->execute([
            ':sub' => $subjectId,
            ':ay' => $academicYearId,
            ':sem' => $semesterId,
            ':pg' => $programId,
            ':tr' => $trackId,
            ':yl' => $yearLevelId,
        ]);
    }

    if (countRows($pdo, 'tbl_elective_slot') === 0 && $programId && $semesterId && $yearLevelId) {
        $pdo->prepare("
            INSERT INTO tbl_elective_slot (`program_id`,`semester_id`,`year_level_id`,`slot_name`,`status`)
            VALUES (:pg,:sem,:yl,'Sample Elective Slot','active')
        ")->execute([':pg' => $programId, ':sem' => $semesterId, ':yl' => $yearLevelId]);
    }
    $slotId = firstId($pdo, 'tbl_elective_slot', 'elective_slot_id');

    if (countRows($pdo, 'tbl_elective_subject') === 0 && $subjectId) {
        $pdo->prepare("
            INSERT INTO tbl_elective_subject (`track_id`,`elective_slot_id`,`subject_id`,`description`)
            VALUES (:tr,:slot,:sub,'Sample elective subject')
        ")->execute([':tr' => $trackId, ':slot' => $slotId, ':sub' => $subjectId]);
    }

    if (countRows($pdo, 'tbl_evaluation') === 0 && $studentId && $subjectId && $academicYearId && $semesterId) {
        $pdo->prepare("
            INSERT INTO tbl_evaluation (`student_id`,`subject_id`,`academic_year_id`,`semester_id`,`grade`,`evaluation_status`,`enrolled_date`)
            VALUES (:stu,:sub,:ay,:sem,'85','passed',:dt)
        ")->execute([':stu' => $studentId, ':sub' => $subjectId, ':ay' => $academicYearId, ':sem' => $semesterId, ':dt' => $today]);
    }

    if (countRows($pdo, 'tbl_credit_evaluation') === 0 && $studentId && $schoolId && $adminUserId) {
        $pdo->prepare("
            INSERT INTO tbl_credit_evaluation (`student_id`,`school_id`,`credit_type`,`evaluated_by`,`evaluation_date`,`status`,`remarks`)
            VALUES (:stu,:sch,'TOR',:ev,:dt,'approved','Sample credit evaluation')
        ")->execute([':stu' => $studentId, ':sch' => $schoolId, ':ev' => $adminUserId, ':dt' => $today]);
    }

    if (countRows($pdo, 'tbl_credit_evaluation_details') === 0 && $studentId && $otherSubjectId && $subjectId) {
        $pdo->prepare("
            INSERT INTO tbl_credit_evaluation_details (`student_id`,`other_subject_id`,`subject_id`,`credited_units`,`credit_basis`,`remarks`)
            VALUES (:stu,:other,:sub,3,'TOR','Sample detail')
        ")->execute([':stu' => $studentId, ':other' => $otherSubjectId, ':sub' => $subjectId]);
    }

    if (countRows($pdo, 'tbl_subject_equivalence') === 0 && $otherSubjectId && $subjectId) {
        $pdo->prepare("
            INSERT INTO tbl_subject_equivalence (`other_school_subject`,`subject_id`,`credited_units`,`credit_basis`,`status`,`remarks`)
            VALUES (:other,:sub,3,'TOR','active','Sample equivalence')
        ")->execute([':other' => $otherSubjectId, ':sub' => $subjectId]);
    }

    if (countRows($pdo, 'audit_logs') === 0) {
        $pdo->prepare("
            INSERT INTO audit_logs (`user_id`,`actions`,`table_name`,`record_id`,`old_value`,`new_value`)
            VALUES (:uid,'CREATE','tbl_users',:rid,'{}','{\"sample\":true}')
        ")->execute([':uid' => $adminUserId, ':rid' => $adminUserId]);
    }

    $pdo->commit();
    echo "Sample data insertion complete for empty tables.\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, "Seeding failed: " . $e->getMessage() . "\n");
    exit(1);
}

