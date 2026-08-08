# MCP Configuration Templates

> _Traducción al español de [README.md](README.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

Este directorio contiene **templates preconfigurados de servidores MCP** para distintas herramientas de AI CLI, más la referencia canónica del servidor MCP de Atlassian opt-in.

## Templates disponibles

| Archivo                  | Para la herramienta | Formato | Descripción                         |
| ------------------------ | ----------- | ------ | ----------------------------------- |
| `claude.template.json`   | Claude Code | JSON   | `.mcp.json` en la raíz del proyecto         |
| `opencode.template.json` | OpenCode    | JSON   | `opencode.jsonc` en la raíz del proyecto    |
| `codex.template.toml`    | Codex CLI   | TOML   | `~/.codex/config.toml` o `.codex/` |
| `gemini.template.json`   | Gemini CLI  | JSON   | `~/.gemini/settings.json`           |

## Atlassian MCP (opt-in)

El servidor MCP de Atlassian **no está habilitado por defecto**. Por defecto este boilerplate usa `acli` (Atlassian CLI) para todo el trabajo de Jira / Confluence / TMS — incluyendo los flujos de test-management tanto de Modality jira-xray como de Modality jira-native. Si necesitás acceso a nivel MCP a Atlassian (por ejemplo para herramientas que acli no expone), habilitalo manualmente:

1. Abrí el template correspondiente dentro de este directorio:
   - Claude Code: `claude.template.json`
   - OpenCode: `opencode.template.json`
   - Gemini CLI: `gemini.template.json`
   - Codex CLI: `codex.template.toml`
2. Copiá el bloque `atlassian` en tu config activa (`.mcp.json` para Claude Code, `opencode.jsonc` para OpenCode, etc.).
3. Confirmá que `ATLASSIAN_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` estén seteadas en `.env` (el installer las recolecta durante `bun run setup`).
4. Reiniciá tu agente para que el nuevo servidor MCP sea tomado.

## Formato de variables

Los templates usan la expansión de variables de entorno nativa de cada herramienta (y placeholders `{{VARIABLE}}` para los valores que la herramienta no puede interpolar). Dos estrategias:

| Estrategia                         | Reemplazar con                       | Luego                                             | Usar cuando                      |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------- | -------------------------------- |
| **A. Valor literal** (legacy)      | El secreto real directamente         | Agregar el archivo de config al `.gitignore`      | Config solo personal             |
| **B. Expansión nativa de env-var** | Sintaxis nativa de la herramienta (ver tabla abajo) | Guardar el valor real en `.env`, commitear la config | Config compartida por el equipo (recomendado) |

### Sintaxis nativa de env-var (para la estrategia B)

| Herramienta | Sintaxis                     | Ejemplo           | Comportamiento con var faltante      |
| ----------- | ---------------------------- | ----------------- | ------------------------------------ |
| Claude Code | `${VAR}` / `${VAR:-default}` | `${API_TOKEN}`    | Falla al parsear la config (seguro)  |
| OpenCode    | `{env:VAR}`                  | `{env:API_TOKEN}` | Sustituye con string vacío (footgun) |
| Codex CLI   | `${VAR}`                     | `${API_TOKEN}`    | Depende del campo                    |
| Gemini CLI  | `$VAR` / `${VAR}`            | `$API_TOKEN`      | Depende del campo                    |

Para la estrategia B, también necesitás un loader de `.env` para que el proceso del agente tenga las vars al momento del spawn:

- Cross-platform: `bun claude` / `bun opencode` (wrapper de `dotenv-cli` en `package.json`)
- macOS/Linux opcional: un `.envrc` con `dotenv_if_exists .env` + `direnv allow`

**Ejemplo funcionando**: mirá `.mcp.json`, `opencode.jsonc` y `.env.example` en la raíz de este repo.

## Servidores MCP incluidos (por defecto — commiteados en `.mcp.json` / `opencode.jsonc`)

| Servidor       | Tipo   | Descripción                                  |
| -------------- | ------ | -------------------------------------------- |
| **context7**   | stdio  | Búsqueda de documentación para developers    |
| **tavily**     | remote | Web search                                   |
| **playwright** | stdio  | E2E browser testing con vision/PDF/tracing   |
| **dbhub**      | stdio  | Database testing vía DBHub                    |
| **openapi**    | stdio  | Lecturas de schema/contract de API (endpoint discovery; ejecución = curl) |
| **postman**    | remote | Colecciones de API y testing                 |

## Servidores MCP disponibles vía template (opt-in)

| Servidor       | Tipo   | Descripción                                  | Cómo habilitarlo                                               |
| -------------- | ------ | -------------------------------------------- | -------------------------------------------------------------- |
| **atlassian**  | stdio  | Jira/Confluence                              | Copiá el bloque `atlassian` del template correspondiente (arriba) |

## Quick Start

### 1. Copiar el template

**Para Claude Code**:

```bash
cp docs/mcp/claude.template.json .mcp.json
```

**Para OpenCode**:

```bash
cp docs/mcp/opencode.template.json opencode.jsonc
```

**Para Codex CLI**:

```bash
mkdir -p ~/.codex
cp docs/mcp/codex.template.toml ~/.codex/config.toml
```

**Para Gemini CLI**:

```bash
mkdir -p ~/.gemini
cp docs/mcp/gemini.template.json ~/.gemini/settings.json
```

### 2. Completar las variables en `.env`

El installer (`bun run setup`) pregunta por cada clave requerida y las escribe en `.env`. Para hacerlo manualmente, copiá `.env.example` a `.env` y completá `TAVILY_API_KEY`, `ATLASSIAN_*`, `API_BASE_URL`, `OPENAPI_SPEC_PATH`, `POSTMAN_API_KEY`. (El token de auth de la API NO se setea en `.env` — se genera en `.auth/tokens.env` mediante `bun run api:login` y lo usa curl.)

### 3. Verificar el setup

Corré tu agente y verificá con:

```
/mcp
```

## Diferencias clave por herramienta

| Feature        | Claude         | OpenCode         | Codex          | Gemini       |
| -------------- | -------------- | ---------------- | -------------- | ------------ |
| Root key       | `mcpServers`   | `mcp`            | `mcp_servers`  | `mcpServers` |
| Command        | string         | array            | string         | string       |
| Env vars       | `env`          | `environment`    | `[server.env]` | `env`        |
| Remote type    | `type: "http"` | `type: "remote"` | `url`          | `httpUrl`    |
| Enable/disable | N/A            | `enabled`        | `enabled`      | N/A          |

## Seguridad

- **Templates** (esta carpeta) = seguros para git, usan placeholders `${VAR}` / `{env:VAR}` / `{{VAR}}`
- **Configs activas** (`.mcp.json`, `opencode.jsonc`) = commiteadas pero solo referencian env vars; los secretos viven en `.env` (gitignored)

## Documentación

Para la guía completa de setup, mirá: [`mcp-configuration-guide.md`](./mcp-configuration-guide.md)
