# DeV Code GitHub Action

Runs DeV Code headless (`dev -p`) on your repository in a workflow.

```yaml
- uses: actions/checkout@v4
- uses: Harsha-code-per/DeV/github@main
  with:
    prompt: "Fix the failing tests and explain what was wrong."
  env:
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}   # any provider key DeV supports
```

Inputs: `prompt` (required), `model` (default `auto/free`), `permission-mode` (default `auto`, since nobody can answer prompts in CI), `version` (default latest). Output: `result`, DeV Code's final answer.

Shell commands still run in DeV's sandbox on Linux runners. The action installs DeV Code from GitHub Releases, so it works once the repository is public (v1.0).
