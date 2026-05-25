@echo off
REM Kong Initialization Script for Windows
REM This script sets up Kong with the initial API routes for the Noah platform

echo Waiting for Kong to be ready...
:wait_for_kong
curl -s http://localhost:8001/status | findstr "reachable" >nul
if %errorlevel% neq 0 (
    echo Kong is not ready yet... waiting 5 seconds
    timeout /t 5 >nul
    goto wait_for_kong
)

echo Kong is ready! Setting up services and routes...

REM Create API service
echo Creating API service...
curl -i -X POST http://localhost:8001/services ^
  --data name=api ^
  --data url=http://api:3001 ^
  --data protocol=http ^
  --data connect_timeout=60000 ^
  --data write_timeout=60000 ^
  --data read_timeout=60000

REM Create API routes
echo Creating API routes...
curl -i -X POST http://localhost:8001/services/api/routes ^
  --data "paths[]=/api" ^
  --data name=api-route ^
  --data strip_path=true

REM Create Web service
echo Creating Web service...
curl -i -X POST http://localhost:8001/services ^
  --data name=web ^
  --data url=http://web:80 ^
  --data protocol=http

REM Create Web routes
echo Creating Web routes...
curl -i -X POST http://localhost:8001/services/web/routes ^
  --data "paths[]=/app" ^
  --data name=web-route

REM Create default route for web
curl -i -X POST http://localhost:8001/services/web/routes ^
  --data "paths[]=/" ^
  --data name=web-root-route

REM Enable CORS for the API
echo Enabling CORS for API...
curl -i -X POST http://localhost:8001/services/api/plugins ^
  --data name=cors ^
  --data config.origins=* ^
  --data config.methods=GET,POST,PUT,DELETE,PATCH,OPTIONS ^
  --data config.headers=Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,Authorization ^
  --data config.exposed_headers=X-Auth-Token ^
  --data config.credentials=true ^
  --data config.max_age=3600

REM Enable rate limiting for API
echo Enabling rate limiting for API...
curl -i -X POST http://localhost:8001/services/api/plugins ^
  --data name=rate-limiting ^
  --data config.minute=1000 ^
  --data config.hour=10000

echo Kong setup complete!
echo API available at: http://localhost:8000/api
echo Web app available at: http://localhost:8000/
echo Kong Admin API at: http://localhost:8001

pause
