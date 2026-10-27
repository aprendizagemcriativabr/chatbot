.PHONY: build-bundle

BLUE=\033[0;34m
NC=\033[0m

build-bundle:
	@echo "$(BLUE)=> Limpando dist/...$(NC)"
	@rm -rf dist
	@echo "$(BLUE)=> Gerando bundle com esbuild...$(NC)"
	@npx esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js --format=cjs
	@echo "$(BLUE)=> Copiando arquivos estaticos de admin...$(NC)"
	@mkdir -p dist/public/admin
	@cp -R public/admin/. dist/public/admin/
	@echo "$(BLUE)=> Criando package.json minimo...$(NC)"
	@echo '{"scripts":{"start":"node index.js"}}' > dist/package.json
	@echo "$(BLUE)=> Gerando app.zip...$(NC)"
	@cd dist && zip -r ../app.zip .
	@echo "$(BLUE)=> Build concluido! Arquivo: app.zip$(NC)"
