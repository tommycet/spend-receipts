# ─────────────────────────────────────────────────────────────────────────
#  Spend Receipts — agent budget audit on a smart account
#
#  `make demo` is the single-command quickstart. It:
#    1. Builds + tests the contracts.
#    2. Starts anvil in the background.
#    3. Deploys MockUSDC, SpendAccount, three MockVendors.
#    4. Copies deployments/latest.json into frontend/public/ so the UI
#       knows which addresses to talk to.
#    5. Starts the Next.js dev server on http://localhost:3000.
#
#  Individual targets are also available if you want to step manually:
#    make build       compile contracts
#    make test        run forge tests
#    make anvil       run local node in the foreground
#    make deploy      deploy to whatever RPC is in ANVIL_RPC
#    make frontend    install + run frontend in dev mode
#    make clean       remove caches + deployments + .next
# ─────────────────────────────────────────────────────────────────────────

SHELL         := /bin/bash
.PHONY        : demo demo-stop build test anvil deploy frontend stop-anvil clean sync-deployments help
.DEFAULT_GOAL : demo

# ──── paths ───────────────────────────────────────────────────────────────
ROOT_DIR       := $(shell pwd)
CONTRACTS_DIR  := $(ROOT_DIR)/contracts
FRONTEND_DIR   := $(ROOT_DIR)/frontend
DEPLOY_FILE    := $(CONTRACTS_DIR)/deployments/latest.json
FRONT_PUB      := $(FRONTEND_DIR)/public/deployments.json

# ──── foundry bin (default ~/.foundry/bin; override with FOUNDRY_BIN) ──────
FOUNDRY_BIN    ?= $(HOME)/.foundry/bin
export PATH    := $(FOUNDRY_BIN):$(PATH)

# ──── anvil defaults ──────────────────────────────────────────────────────
ANVIL_PORT     ?= 8545
ANVIL_HOST     ?= 127.0.0.1
ANVIL_CHAIN_ID ?= 31337
ANVIL_RPC      ?= http://$(ANVIL_HOST):$(ANVIL_PORT)
ANVIL_PIDFILE  := $(ROOT_DIR)/.anvil.pid
ANVIL_LOGFILE  := $(ROOT_DIR)/.anvil.log

# ──── anvil default key (account 0 — has 1000 ETH pre-funded) ─────────────
PRIVATE_KEY    ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# ──── frontend port ──────────────────────────────────────────────────────
PORT           ?= 3000

# ─────────────────────────────────────────────────────────────────────────
#  demo — single-command quickstart
# ─────────────────────────────────────────────────────────────────────────
demo: build test stop-anvil anvil-bg deploy sync-deployments frontend
	@echo ""
	@echo "  ╔══════════════════════════════════════════════════════════╗"
	@echo "  ║  DEMO READY                                              ║"
	@echo "  ║                                                          ║"
	@echo "  ║  Frontend:  http://localhost:$(PORT)                     ║"
	@echo "  ║  Anvil RPC: $(ANVIL_RPC)                                 ║"
	@echo "  ║  Chain ID:  $(ANVIL_CHAIN_ID)                            ║"
	@echo "  ║                                                          ║"
	@echo "  ║  MetaMask: add network localhost:$(ANVIL_PORT), chainId $(ANVIL_CHAIN_ID)  ║"
	@echo "  ║  Import account 0 private key from `anvil` output above.  ║"
	@echo "  ║                                                          ║"
	@echo "  ║  Then click through:                                     ║"
	@echo "  ║    Setup → SEED DEMO STATE                               ║"
	@echo "  ║    Activity → 3 payment buttons                          ║"
	@echo "  ║    Activity → REFUND on the $4 receipt                   ║"
	@echo "  ║    Summary → verify Spent \$3 / Refunded \$4 / Blocked \$8 ║"
	@echo "  ╚══════════════════════════════════════════════════════════╝"
	@echo ""

demo-stop:
	@$(MAKE) -s stop-anvil

# ─────────────────────────────────────────────────────────────────────────
#  contracts
# ─────────────────────────────────────────────────────────────────────────
build:
	cd $(CONTRACTS_DIR) && forge build

test:
	cd $(CONTRACTS_DIR) && forge test

deploy:
	@mkdir -p $(CONTRACTS_DIR)/deployments
	cd $(CONTRACTS_DIR) && \
	  PRIVATE_KEY=$(PRIVATE_KEY) \
	  forge script script/Deploy.s.sol:Deploy \
	    --rpc-url $(ANVIL_RPC) \
	    --broadcast

sync-deployments:
	@test -f $(DEPLOY_FILE) || (echo "MISSING: $(DEPLOY_FILE) - run \`make deploy\` first" && exit 1)
	@mkdir -p $(FRONTEND_DIR)/public
	@cp $(DEPLOY_FILE) $(FRONT_PUB)
	@echo "synced $(DEPLOY_FILE) -> $(FRONT_PUB)"

# ─────────────────────────────────────────────────────────────────────────
#  anvil lifecycle
# ─────────────────────────────────────────────────────────────────────────
anvil-bg:
	@if [ -f $(ANVIL_PIDFILE) ] && kill -0 `cat $(ANVIL_PIDFILE)` 2>/dev/null; then \
	  echo "anvil already running (pid `cat $(ANVIL_PIDFILE)`)"; \
	else \
	  nohup $(FOUNDRY_BIN)/anvil \
	    --host $(ANVIL_HOST) \
	    --port $(ANVIL_PORT) \
	    --chain-id $(ANVIL_CHAIN_ID) \
	    --accounts 10 \
	    --balance 1000 \
	    > $(ANVIL_LOGFILE) 2>&1 & \
	  echo $$! > $(ANVIL_PIDFILE); \
	  sleep 2; \
	  echo "anvil started (pid `cat $(ANVIL_PIDFILE)`, log $(ANVIL_LOGFILE))"; \
	fi

anvil: anvil-bg
	@echo "anvil running at $(ANVIL_RPC); tail $(ANVIL_LOGFILE) for output"

stop-anvil:
	@if [ -f $(ANVIL_PIDFILE) ]; then \
	  PID=`cat $(ANVIL_PIDFILE)`; \
	  if kill -0 $$PID 2>/dev/null; then \
	    kill $$PID && echo "stopped anvil (pid $$PID)"; \
	  fi; \
	  rm -f $(ANVIL_PIDFILE); \
	else \
	  echo "anvil not running"; \
	fi

# ─────────────────────────────────────────────────────────────────────────
#  frontend
# ─────────────────────────────────────────────────────────────────────────
frontend:
	@if [ ! -d $(FRONTEND_DIR)/node_modules ]; then \
	  echo "installing frontend deps..."; \
	  cd $(FRONTEND_DIR) && npm install; \
	fi
	@if [ ! -f $(FRONT_PUB) ]; then \
	  echo "WARN: $(FRONT_PUB) missing — UI will show NO CONTRACT DEPLOYED"; \
	  echo "      run \`make sync-deployments\` after \`make deploy\`"; \
	fi
	cd $(FRONTEND_DIR) && PORT=$(PORT) npm run dev

# ─────────────────────────────────────────────────────────────────────────
#  clean
# ─────────────────────────────────────────────────────────────────────────
clean: stop-anvil
	rm -rf $(CONTRACTS_DIR)/cache $(CONTRACTS_DIR)/out $(CONTRACTS_DIR)/broadcast $(CONTRACTS_DIR)/deployments
	rm -rf $(FRONTEND_DIR)/.next $(FRONTEND_DIR)/public/deployments.json
	rm -f $(ANVIL_PIDFILE) $(ANVIL_LOGFILE)

help:
	@echo "Targets:"
	@echo "  make demo              - build + test + anvil + deploy + frontend (the quickstart)"
	@echo "  make build             - forge build"
	@echo "  make test              - forge test"
	@echo "  make anvil             - start local anvil node (foreground wait)"
	@echo "  make deploy            - deploy contracts to \$$ANVIL_RPC"
	@echo "  make sync-deployments  - copy deployments/latest.json -> frontend/public/"
	@echo "  make frontend          - install + start Next.js dev server"
	@echo "  make demo-stop         - stop the anvil node"
	@echo "  make clean             - remove all build artifacts + .next"
