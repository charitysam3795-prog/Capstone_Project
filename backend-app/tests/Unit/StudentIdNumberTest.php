<?php

namespace Tests\Unit;

use App\Support\StudentIdNumber;
use PHPUnit\Framework\TestCase;

class StudentIdNumberTest extends TestCase
{
    public function test_canonicalize_pads_campus_code(): void
    {
        $this->assertSame('02-2324-07413', StudentIdNumber::canonicalize('2-2324-07413'));
        $this->assertSame('02-2324-07413', StudentIdNumber::canonicalize('02-2324-07413'));
        $this->assertSame('02-2324-07413', StudentIdNumber::canonicalize(' 2-2324-07413 '));
    }

    public function test_login_candidates_include_padding_variants(): void
    {
        $candidates = StudentIdNumber::loginCandidates('2-2324-7413');

        $this->assertContains('2-2324-7413', $candidates);
        $this->assertContains('02-2324-7413', $candidates);
        $this->assertContains('02-2324-07413', $candidates);
    }

    public function test_parse_phinma_ignores_leading_zeros(): void
    {
        $a = StudentIdNumber::parsePhinma('2-2324-07413');
        $b = StudentIdNumber::parsePhinma('02-2324-7413');

        $this->assertSame($a, $b);
        $this->assertSame(2, $a['campus']);
        $this->assertSame('2324', $a['year']);
        $this->assertSame(7413, $a['serial']);
    }
}
