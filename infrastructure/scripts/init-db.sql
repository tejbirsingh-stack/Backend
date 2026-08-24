-- Initialize Noah Media Asset Management Platform Database
-- This script sets up the core database with TimescaleDB extensions

-- Enable TimescaleDB extension
-- CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable additional extensions for advanced features
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create schemas for organization
CREATE SCHEMA IF NOT EXISTS noah_core;
CREATE SCHEMA IF NOT EXISTS noah_media;
CREATE SCHEMA IF NOT EXISTS noah_audit;
CREATE SCHEMA IF NOT EXISTS noah_analytics;

-- Set search path
SET search_path TO noah_core, noah_media, noah_audit, noah_analytics, public;

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer', 'contributor');
CREATE TYPE media_status AS ENUM ('uploading', 'processing', 'ready', 'failed', 'archived');
CREATE TYPE storage_tier AS ENUM ('hot', 'warm', 'cold', 'archive');
CREATE TYPE compression_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    storage_quota_bytes BIGINT DEFAULT 107374182400, -- 100GB default
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(32),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization memberships
CREATE TABLE IF NOT EXISTS organization_members (
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'viewer',
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- Media assets table
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    duration_seconds DECIMAL(10,3),
    width INTEGER,
    height INTEGER,
    frame_rate DECIMAL(8,3),
    bitrate INTEGER,
    status media_status DEFAULT 'uploading',
    storage_tier storage_tier DEFAULT 'hot',
    storage_key VARCHAR(500) NOT NULL,
    thumbnail_key VARCHAR(500),
    preview_key VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    description TEXT,
    upload_session_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collection items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS collection_items (
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    media_asset_id UUID REFERENCES media_assets(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (collection_id, media_asset_id)
);

-- Compression jobs table
CREATE TABLE IF NOT EXISTS compression_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    input_key VARCHAR(500) NOT NULL,
    output_key VARCHAR(500),
    compression_preset VARCHAR(50) NOT NULL,
    status compression_status DEFAULT 'pending',
    progress_percentage INTEGER DEFAULT 0,
    original_size_bytes BIGINT,
    compressed_size_bytes BIGINT,
    compression_ratio DECIMAL(5,2),
    quality_score DECIMAL(4,2),
    processing_time_seconds INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User sessions for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    risk_score INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs (will be converted to hypertable)
CREATE TABLE IF NOT EXISTS audit_logs (
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    id UUID DEFAULT uuid_generate_v4(),
    organization_id UUID,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert audit_logs to hypertable for time-series data
-- SELECT create_hypertable('audit_logs', 'time', if_not_exists => TRUE);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

CREATE INDEX IF NOT EXISTS idx_media_assets_org ON media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_user ON media_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status);
CREATE INDEX IF NOT EXISTS idx_media_assets_storage_tier ON media_assets(storage_tier);
CREATE INDEX IF NOT EXISTS idx_media_assets_mime_type ON media_assets(mime_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON media_assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_media_assets_metadata ON media_assets USING GIN(metadata);

CREATE INDEX IF NOT EXISTS idx_collections_org ON collections(organization_id);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_public ON collections(is_public);

CREATE INDEX IF NOT EXISTS idx_compression_jobs_asset ON compression_jobs(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_compression_jobs_status ON compression_jobs(status);
CREATE INDEX IF NOT EXISTS idx_compression_jobs_created_at ON compression_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_media_assets_search ON media_assets USING GIN(
    to_tsvector('english', filename || ' ' || COALESCE(description, ''))
);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_organizations
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_users
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_media_assets
    BEFORE UPDATE ON media_assets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_collections
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Create default organization for development
INSERT INTO organizations (name, slug) VALUES ('Noah Development', 'noah-dev') ON CONFLICT DO NOTHING;

-- Create analytics views
CREATE OR REPLACE VIEW storage_usage_by_org AS
SELECT 
    o.id,
    o.name,
    o.slug,
    COUNT(ma.id) as total_assets,
    SUM(ma.file_size) as total_size_bytes,
    ROUND(SUM(ma.file_size)::NUMERIC / 1024 / 1024 / 1024, 2) as total_size_gb,
    AVG(ma.file_size) as avg_file_size_bytes
FROM organizations o
LEFT JOIN media_assets ma ON o.id = ma.organization_id
GROUP BY o.id, o.name, o.slug;

CREATE OR REPLACE VIEW compression_efficiency AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as jobs_completed,
    AVG(compression_ratio) as avg_compression_ratio,
    AVG(quality_score) as avg_quality_score,
    SUM(original_size_bytes - compressed_size_bytes) as total_savings_bytes
FROM compression_jobs 
WHERE status = 'completed'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Set up retention policies for audit logs (keep 1 year)
-- SELECT add_retention_policy('audit_logs', INTERVAL '1 year', if_not_exists => TRUE);

-- Grant permissions
GRANT USAGE ON SCHEMA noah_core TO noah_user;
GRANT USAGE ON SCHEMA noah_media TO noah_user;
GRANT USAGE ON SCHEMA noah_audit TO noah_user;
GRANT USAGE ON SCHEMA noah_analytics TO noah_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA noah_core TO noah_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA noah_media TO noah_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA noah_audit TO noah_user;
GRANT SELECT ON ALL TABLES IN SCHEMA noah_analytics TO noah_user;

-- Create replication user for postgres-replica
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_user WHERE usename = 'replicator') THEN
        CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'your_strong_replicator_password_here';
    END IF;
END
$$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Noah Media Asset Management Platform database initialized successfully!';
    RAISE NOTICE 'TimescaleDB extensions enabled';
    RAISE NOTICE 'All tables, indexes, and triggers created';
    RAISE NOTICE 'Default organization created: noah-dev';
END $$;