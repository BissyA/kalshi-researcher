-- Add speaker_id FK to events table for explicit speaker linkage
ALTER TABLE events ADD COLUMN speaker_id UUID REFERENCES speakers(id) ON DELETE SET NULL;
CREATE INDEX idx_events_speaker_id ON events(speaker_id);
