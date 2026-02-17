#!/bin/bash

# Airport Ride Pooling System - One-Click Setup Script
# This script sets up the entire system from scratch

set -e  # Exit on error

echo "🚀 Airport Ride Pooling System - Setup"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed. Please install Bun first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
print_status "Bun is installed"

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker Desktop first"
    exit 1
fi
print_status "Docker is installed"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
bun install
print_status "Dependencies installed"

# Start services
echo ""
echo "🐳 Starting PostgreSQL and Redis..."
cd packages/db
bun run db:start
cd ../..
sleep 5  # Wait for services to start

# Check if services are running
if docker ps | grep -q "alike-postgres"; then
    print_status "PostgreSQL is running"
else
    print_error "PostgreSQL failed to start"
    exit 1
fi

if docker ps | grep -q "alike-redis"; then
    print_status "Redis is running"
else
    print_error "Redis failed to start"
    exit 1
fi

# Setup environment
echo ""
echo "⚙️  Setting up environment..."
if [ ! -f "apps/web/.env" ]; then
    cat > apps/web/.env << 'EOF'
DATABASE_URL=postgresql://postgres:password@localhost:5432/alike
REDIS_HOST=localhost
REDIS_PORT=6379
EOF
    print_status "Created apps/web/.env"
fi

if [ ! -f "packages/db/.env" ]; then
    cat > packages/db/.env << 'EOF'
DATABASE_URL=postgresql://postgres:password@localhost:5432/alike
CORS_ORIGIN=http://localhost:3000
EOF
    print_status "Created packages/db/.env"
fi

# Generate and apply migrations
echo ""
echo "🗄️  Setting up database..."
cd packages/db

# Generate migrations
print_status "Generating migrations..."
bun run db:generate || {
    print_warning "Migration generation may have issues, continuing..."
}

# Apply migrations
print_status "Applying migrations..."
bun run db:migrate

# Seed data
print_status "Seeding test data..."
bunx tsx src/seed.ts || {
    print_warning "Seed may have failed, continuing..."
}

cd ../..

# Build the application
echo ""
echo "🔨 Building application..."
bun run build || {
    print_warning "Build may have warnings, continuing..."
}

# Final instructions
echo ""
echo "======================================"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "======================================"
echo ""
echo "To start the system, run these in separate terminals:"s
echo ""
echo "Terminal 1 - Start Worker:"
echo "  cd $(pwd)/packages/db && bunx tsx src/start-worker.ts"
echo ""
echo "Terminal 2 - Start Web Server:"
echo "  cd $(pwd) && bun run dev:web"
echo ""
echo "Then visit:"
echo "  - API Docs: http://localhost:3000/api-doc"
echo "  - Database Studio: http://localhost:4983"
echo ""
echo "Test the API:"
echo "  curl http://localhost:3000/api/users"
echo ""

exit 0
