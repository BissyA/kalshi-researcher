-- Make categories global (not per-speaker).
-- Previously `speaker_categories` was scoped per speaker_id, so the same
-- category name ("Foreign Policy") could exist once per speaker. We now
-- merge duplicates into a single canonical row per name, shared across
-- all speakers. Rename propagation, approvals, and retro-classification
-- now happen globally.

-- Step 1: Null out any sections currently labeled "Other" — user will
-- reassign them in the UI. "Other" is removed from the canonical list.
UPDATE transcript_sections
SET category_id = NULL, category_name = NULL
WHERE category_name = 'Other';

-- Step 2: Re-point transcript_sections.category_id at the canonical row
-- for each name. Canonical = approved first, then oldest created_at.
WITH ranked AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY name
      ORDER BY
        CASE status WHEN 'approved' THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM speaker_categories
  WHERE name <> 'Other'
),
canonical AS (
  SELECT id, name FROM ranked WHERE rn = 1
),
remap AS (
  SELECT sc.id AS old_id, c.id AS new_id
  FROM speaker_categories sc
  JOIN canonical c ON c.name = sc.name
  WHERE sc.id <> c.id
)
UPDATE transcript_sections ts
SET category_id = remap.new_id
FROM remap
WHERE ts.category_id = remap.old_id;

-- Step 3: Delete non-canonical duplicates.
-- First drop all "Other" rows (not kept in canonical list).
DELETE FROM speaker_categories WHERE name = 'Other';

-- Then drop non-canonical duplicates of remaining names.
DELETE FROM speaker_categories sc
WHERE sc.id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY name
        ORDER BY
          CASE status WHEN 'approved' THEN 0 ELSE 1 END,
          created_at ASC NULLS LAST,
          id ASC
      ) AS rn
    FROM speaker_categories
  ) r
  WHERE rn > 1
);

-- Step 4: Promote any remaining pending duplicates to approved
-- (since their "twin" was already approved by another speaker).
-- Not strictly necessary after dedupe, but this ensures any row that
-- shared a name with an approved one is now approved. Safe to re-run.
UPDATE speaker_categories
SET status = 'approved'
WHERE status = 'pending'
  AND name IN (SELECT name FROM speaker_categories WHERE status = 'approved');

-- Step 5: Swap the uniqueness constraint from (speaker_id, name) to (name).
ALTER TABLE speaker_categories
  DROP CONSTRAINT speaker_categories_speaker_id_name_key;

ALTER TABLE speaker_categories
  ADD CONSTRAINT speaker_categories_name_key UNIQUE (name);

-- Step 6: Drop the speaker_id column + FK + index (no longer needed).
DROP INDEX IF EXISTS idx_speaker_categories_speaker;
ALTER TABLE speaker_categories DROP COLUMN speaker_id;
