.DEFAULT_GOAL := help

# Colors
G := \033[0;32m
Y := \033[1;33m
R := \033[0;31m
C := \033[0;36m
B := \033[1m
X := \033[0m

.PHONY: up down restart build logs open shell status train clean nuke help

##@ Start / Stop

up: ## Build image if needed, then start the web UI
	@echo "$(B)$(G)→ Wake Word Trainer$(X)"
	@docker compose up --build -d web
	@echo ""
	@echo "  $(G)✓ Ready$(X)  $(C)http://localhost:3000$(X)"
	@echo "  Logs → $(B)make logs$(X)    Stop → $(B)make down$(X)"
	@echo ""

down: ## Stop all services
	@echo "$(Y)→ Stopping...$(X)"
	@docker compose down
	@echo "$(G)✓ Stopped$(X)"

restart: down up ## Stop, then start again

##@ Development

build: ## Force full rebuild without cache
	@echo "$(Y)→ Rebuilding (no cache)...$(X)"
	@docker compose build --no-cache web
	@echo "$(G)✓ Done — run$(X) $(B)make up$(X)"

logs: ## Follow live logs  (Ctrl+C to exit)
	@docker compose logs -f --tail=100 web

open: ## Open http://localhost:3000 in the browser
	@open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000

shell: ## Open a bash shell inside the running container
	@docker compose exec web bash

status: ## Show container status
	@docker compose ps

##@ CLI Training  (no web UI required)

train: ## Run training — make train WORD="Hey Dobbi" [SAMPLES=500] [STEPS=5000] [FULL=1]
	@[ -n "$(WORD)" ] || { \
		echo "$(R)Error: WORD is required$(X)"; \
		echo "Usage: $(B)make train WORD=\"Hey Dobbi\"$(X)"; \
		echo "       $(B)make train WORD=\"Hey Dobbi\" SAMPLES=1000 STEPS=10000$(X)"; \
		exit 1; }
	@docker compose run --rm \
		-e PYTHONUNBUFFERED=1 \
		trainer "$(WORD)" \
		--samples $(or $(SAMPLES),500) \
		--steps   $(or $(STEPS),5000) \
		$(if $(FULL),--full,)

##@ Cleanup

clean: ## Remove containers, image and DB — keeps ./data and ./output
	@echo "$(Y)→ Removing containers, image, DB volume...$(X)"
	@docker compose down --rmi local --volumes --remove-orphans
	@echo "$(G)✓ Clean. Run$(X) $(B)make$(X) $(G)to rebuild.$(X)"

nuke: ## ⚠ FULL RESET — removes everything including all downloaded data
	@echo ""
	@echo "$(R)$(B)  ⚠  FULL RESET$(X)"
	@echo "$(R)  Removes: containers · images · volumes$(X)"
	@echo "$(R)           ./data  ./output  ./piper-voices$(X)"
	@echo ""
	@printf "$(Y)  Type YES to confirm: $(X)" && read c && [ "$$c" = "YES" ] || { echo "Aborted."; exit 1; }
	@docker compose down --rmi all --volumes --remove-orphans
	@rm -rf data output piper-voices
	@echo "$(G)✓ Full reset done. Run$(X) $(B)make$(X) $(G)to start from scratch.$(X)"

##@ Help

help: ## Show this help (default)
	@echo ""
	@echo "$(B)  Wake Word Trainer$(X)"
	@echo ""
	@awk ' \
		/^##@/ { printf "\n$(B)  %s$(X)\n", substr($$0, 5) } \
		/^[a-z][a-zA-Z_-]+:.*## / { \
			split($$0, a, ":.*## "); \
			printf "  $(G)make %-12s$(X) %s\n", a[1], a[2] \
		}' $(MAKEFILE_LIST)
	@echo ""
