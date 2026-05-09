DB_NAME   ?= paperclip_dev
DB_URL    ?= postgres://localhost:5432/$(DB_NAME)
PORT      ?= 3100

.PHONY: dev stop restart db-start db-stop db-reset db-create db-drop install help

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  dev        Start the dev server (creates DB if missing)"
	@echo "  stop       Kill the dev server on port $(PORT)"
	@echo "  restart    stop + dev"
	@echo "  db-start   Start PostgreSQL via Homebrew services"
	@echo "  db-stop    Stop PostgreSQL via Homebrew services"
	@echo "  db-create  Create the $(DB_NAME) database"
	@echo "  db-drop    Drop the $(DB_NAME) database"
	@echo "  db-reset   Drop, recreate, and restart dev server"
	@echo "  install    pnpm install"

dev: db-create
	DATABASE_URL="$(DB_URL)" pnpm dev

stop:
	@lsof -ti:$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on :$(PORT)" || echo "Nothing running on :$(PORT)"

restart: stop dev

db-start:
	brew services start postgresql@18

db-stop:
	brew services stop postgresql@18

db-create:
	@createdb $(DB_NAME) 2>/dev/null && echo "Created $(DB_NAME)" || echo "$(DB_NAME) already exists"

db-drop:
	dropdb --if-exists $(DB_NAME) && echo "Dropped $(DB_NAME)"

db-reset: stop db-drop db-create
	DATABASE_URL="$(DB_URL)" pnpm dev

install:
	pnpm install
