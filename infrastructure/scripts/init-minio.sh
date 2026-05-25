#!/bin/sh

# Wait for MinIO to be ready
echo "Waiting for MinIO to start..."
/usr/bin/mc config host add myminio http://minio:9000 noah_minio_user noah_minio_password

# Check if the MinIO server is up
until /usr/bin/mc ls myminio > /dev/null 2>&1; do
  echo "Waiting for MinIO server to be ready..."
  sleep 1
done

# Create required buckets if they don't exist
echo "Creating bucket: noah-assets"
/usr/bin/mc mb --ignore-existing myminio/noah-assets

# Set bucket policy to public (for development only)
echo "Setting bucket policy to public..."
/usr/bin/mc policy set public myminio/noah-assets

echo "MinIO setup completed"
