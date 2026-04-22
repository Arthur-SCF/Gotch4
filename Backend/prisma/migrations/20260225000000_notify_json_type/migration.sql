-- M-13: Convert notifyFieldConfig and notifyTemplate from TEXT to JSONB
-- Existing NULL values pass through; existing TEXT values must be valid JSON
-- AlterTable
ALTER TABLE "Settings"
  ALTER COLUMN "notifyFieldConfig" TYPE JSONB USING
    CASE WHEN "notifyFieldConfig" IS NULL THEN NULL
         ELSE "notifyFieldConfig"::jsonb END,
  ALTER COLUMN "notifyTemplate" TYPE JSONB USING
    CASE WHEN "notifyTemplate" IS NULL THEN NULL
         ELSE "notifyTemplate"::jsonb END;
