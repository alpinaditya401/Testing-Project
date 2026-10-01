<?php
declare(strict_types=1);
// Threshold Rules for AquaSmart water quality monitoring
// Version: threshold-rules-v2
//
// SINGLE SOURCE OF TRUTH for water-quality limits.
//
// v1 -> v2 (2026-09-18): v1 published pH 6.0-9.0 / suhu 24-30 via GET /api/rules
// while Auth::register seeded every new workspace with pH 6.5-8.5 / suhu 25-30.
// A reading of pH 6.2 was therefore "in range" to any firmware reading the rule
// contract but "alert" to the dashboard. The seeded values were the intended
// ones, so the constants below now match them and Auth::register reads from
// here instead of repeating literals in SQL.
//
// Changing any constant changes getHash(), which is the signal to firmware that
// the contract moved. Bump VERSION whenever a constant changes.

final class ThresholdRules
{
    public const VERSION = 'threshold-rules-v2';

    public const PH_MIN = 6.5;
    public const PH_MAX = 8.5;
    public const TEMP_MIN = 25.0;
    public const TEMP_MAX = 30.0;
    public const TURBIDITY_MAX = 50.0;

    public static function getVersion(): string {
        return self::VERSION;
    }

    public static function getHash(): string {
        return hash('sha256',self::VERSION.' '.self::PH_MIN.' '.self::PH_MAX.' '.self::TEMP_MIN.' '.self::TEMP_MAX.' '.self::TURBIDITY_MAX);
    }

    /**
     * Defaults written into threshold_settings for a newly registered
     * workspace. Keyed to match the threshold_settings column names so
     * Auth::register can bind them directly.
     *
     * @return array{ph_min:float,ph_max:float,temperature_min:float,temperature_max:float,turbidity_max:float}
     */
    public static function defaults(): array {
        return [
            'ph_min' => self::PH_MIN,
            'ph_max' => self::PH_MAX,
            'temperature_min' => self::TEMP_MIN,
            'temperature_max' => self::TEMP_MAX,
            'turbidity_max' => self::TURBIDITY_MAX,
        ];
    }
}
