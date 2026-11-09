<?php

namespace Tests\Unit;

use App\Support\EvaluationAttemptPicker;
use PHPUnit\Framework\TestCase;

class EvaluationAttemptPickerTest extends TestCase
{
    public function test_prefers_passed_retake_over_older_fail_even_when_fail_has_higher_semester_id(): void
    {
        $oldFail = (object) [
            'evaluation_id' => 4153,
            'academic_year_id' => 1,
            'semester_id' => 2,
            'grade' => '5.00',
            'evaluation_status' => 'failed',
        ];
        $retakePass = (object) [
            'evaluation_id' => 6638,
            'academic_year_id' => 4,
            'semester_id' => 1,
            'grade' => '2.25',
            'evaluation_status' => 'passed',
        ];

        $pick = EvaluationAttemptPicker::prefer(
            [$oldFail, $retakePass],
            [1 => 2023, 4 => 2024]
        );

        $this->assertSame(6638, (int) $pick->evaluation_id);
        $this->assertSame('2.25', (string) $pick->grade);
    }

    public function test_prefers_newer_fail_when_both_failed(): void
    {
        $first = (object) [
            'evaluation_id' => 10,
            'academic_year_id' => 1,
            'semester_id' => 2,
            'grade' => '5.00',
            'evaluation_status' => 'failed',
        ];
        $second = (object) [
            'evaluation_id' => 99,
            'academic_year_id' => 4,
            'semester_id' => 1,
            'grade' => '5.00',
            'evaluation_status' => 'failed',
        ];

        $pick = EvaluationAttemptPicker::prefer(
            [$first, $second],
            [1 => 2023, 4 => 2024]
        );

        $this->assertSame(99, (int) $pick->evaluation_id);
    }

    public function test_applies_to_any_subject_not_only_programming(): void
    {
        $old = (object) [
            'evaluation_id' => 1,
            'academic_year_id' => 1,
            'semester_id' => 2,
            'grade' => '5.00',
            'evaluation_status' => 'failed',
        ];
        $imported = (object) [
            'evaluation_id' => 50,
            'academic_year_id' => 4,
            'semester_id' => 1,
            'grade' => '1.75',
            'evaluation_status' => 'passed',
        ];

        $pick = EvaluationAttemptPicker::prefer([$old, $imported], [1 => 2023, 4 => 2024]);

        $this->assertSame('1.75', (string) $pick->grade);
    }
}
