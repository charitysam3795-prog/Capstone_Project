<?php

return [

    /*
    |--------------------------------------------------------------------------
    | INC default compliance window (days)
    |--------------------------------------------------------------------------
    |
    | When an evaluator marks INC but does not choose a "Comply by" date, the
    | server sets the deadline to today plus this many days. Override with
    | INC_DEFAULT_COMPLIANCE_DAYS in .env (1–730). Per-subject dates are still
    | set manually on the evaluator form when needed.
    |
    */

    'inc_default_compliance_days' => max(1, min(730, (int) env('INC_DEFAULT_COMPLIANCE_DAYS', 30))),

];
