# AquaSmart Threshold Rules

This document defines the default threshold rules for water quality monitoring.

## Rule Version

Version: `threshold-rules-v1`

## Parameters

| Parameter | Min Value | Max Value |
|-----------|-----------|-----------|
| pH        | 6.0       | 9.0       |
| Temperature (°C) | 24.0   | 30.0      |
| Turbidity (NTU)  | —     | 50.0      |

## Behavior

- When any sensor reading falls outside these thresholds, an alert is generated
- Alerts are persisted and can be acknowledged by admin users
- Automatic recommendations are generated based on breach patterns

## Security Notes

`GET /api/rules` hashes the algorithm version and baseline constants in `src/ThresholdRules.php`, not this Markdown file. Actual owner settings may differ from this baseline. `GET /api/rule-versions` exposes persisted snapshots of the thresholds used by new ingestion, scoped to the authenticated workspace. It does not reconstruct versions for historical seed readings.
Any modification must update the hash in router.php.
