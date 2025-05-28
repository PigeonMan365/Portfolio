-- Create eras table
CREATE TABLE IF NOT EXISTS eras (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    era VARCHAR(50) NOT NULL,
    is_excluded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, era)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_eras_user_id ON eras(user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_eras_updated_at
    BEFORE UPDATE ON eras
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 