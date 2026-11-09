# DeV Code GitHub Action

Runs DeV Code headless (`devcode run`) on your repository in a workflow.

To have DeV Code answer `@devcode` in issues and pull requests instead, run `devcode github install` in your repository. It writes a self-contained workflow that opens a pull request for an issue, or pushes to a pull request's branch, and replies with what it did.

```yaml
- uses: actions/checkout@v4
- uses: Harsha-code-per/DeV/github@main
  with:
    prompt: "Fix the failing tests and explain what was wrong."
  env:
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}   # any provider key DeV supports
```

Inputs: `prompt` (required), `model` (default `auto/free`), `permission-mode` (default `auto`, since nobody can answer prompts in CI), `version` (default latest). Output: `result`, DeV Code's final answer.

Shell commands still run in DeV's sandbox on Linux runners. The action installs DeV Code from npm. Referencing this action from another repository works once this repository is public (v1.0); the `devcode github install` workflow works today.
