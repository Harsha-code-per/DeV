"""
Codebase Analysis Engine for DeV

Performs intelligent repository inspection and task-aware file discovery.

Responsibilities:
- Inspect project structure and understand project type
- Detect project configuration (language, build system, package manager)
- Discover relevant files based on task context
- Provide structured analysis for patch generation
"""

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Optional, Set
from enum import Enum

from app.utils.logger import setup_logger
from app.tools.terminal import SafeTerminalExecutor


logger = setup_logger(__name__)


class ProjectType(str, Enum):
    """Supported project types"""
    PYTHON = "python"
    NODEJS = "nodejs"
    RUST = "rust"
    GO = "go"
    JAVA = "java"
    DOTNET = "dotnet"
    PHP = "php"
    RUBY = "ruby"
    UNKNOWN = "unknown"


@dataclass
class ProjectStructure:
    """Analysis of project structure and configuration"""
    project_type: ProjectType
    root_path: Path
    primary_language: str
    build_system: str  # e.g., "npm", "poetry", "cargo", "make"
    has_tests: bool
    has_docs: bool
    config_files: List[str] = field(default_factory=list)
    dependency_files: List[str] = field(default_factory=list)
    build_scripts: List[str] = field(default_factory=list)
    test_files: List[str] = field(default_factory=list)
    main_source_dirs: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/display"""
        return {
            "project_type": self.project_type.value,
            "root_path": str(self.root_path),
            "primary_language": self.primary_language,
            "build_system": self.build_system,
            "has_tests": self.has_tests,
            "has_docs": self.has_docs,
            "config_files": self.config_files,
            "dependency_files": self.dependency_files,
            "build_scripts": self.build_scripts,
            "test_files": self.test_files,
            "main_source_dirs": self.main_source_dirs,
        }


@dataclass
class RelevantFiles:
    """Files identified as relevant to a task"""
    likely_affected: List[str]
    config_files: List[str]
    test_files: List[str]
    related_files: List[str]
    git_status: Dict[str, str]  # filename -> status (modified, untracked, etc.)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/display"""
        return {
            "likely_affected": self.likely_affected,
            "config_files": self.config_files,
            "test_files": self.test_files,
            "related_files": self.related_files,
            "git_status": self.git_status,
        }


class CodebaseAnalyzer:
    """Intelligent project inspection and file discovery"""
    
    # File patterns for detection
    PYTHON_MARKERS = {"pyproject.toml", "setup.py", "requirements.txt", "Pipfile"}
    NODEJS_MARKERS = {"package.json", "package-lock.json", "yarn.lock"}
    RUST_MARKERS = {"Cargo.toml"}
    GO_MARKERS = {"go.mod"}
    JAVA_MARKERS = {"pom.xml", "build.gradle"}
    DOTNET_MARKERS = {"*.csproj", "*.sln"}
    PHP_MARKERS = {"composer.json"}
    RUBY_MARKERS = {"Gemfile"}
    
    # Keywords for task-aware file discovery
    BUILD_KEYWORDS = {"build", "build fail", "build error", "compile", "compilation"}
    TEST_KEYWORDS = {"test", "tests failing", "test fail", "unit test"}
    CONFIG_KEYWORDS = {"config", "configuration", "settings", "env"}
    DEPENDENCY_KEYWORDS = {"depend", "package", "module", "import", "require"}
    PERFORMANCE_KEYWORDS = {"performance", "slow", "optimize", "lag"}
    SECURITY_KEYWORDS = {"security", "vulnerability", "auth", "encrypt"}
    
    def __init__(self, repo_path: Path, terminal_executor: Optional[SafeTerminalExecutor] = None):
        """Initialize analyzer"""
        self.repo_path = Path(repo_path)
        self.terminal_executor = terminal_executor or SafeTerminalExecutor()
        logger.info(f"CodebaseAnalyzer initialized for: {self.repo_path}")
    
    def analyze_structure(self) -> ProjectStructure:
        """
        Analyze project structure and detect configuration.
        
        Returns:
            ProjectStructure with detected project type and configuration
        """
        logger.info("Analyzing project structure...")
        
        # Detect project type
        project_type = self._detect_project_type()
        logger.debug(f"Detected project type: {project_type.value}")
        
        # Detect language and build system
        language, build_system = self._detect_language_and_build_system(project_type)
        logger.debug(f"Language: {language}, Build system: {build_system}")
        
        # Find config and dependency files
        config_files = self._find_config_files()
        dependency_files = self._find_dependency_files(project_type)
        build_scripts = self._find_build_scripts(project_type)
        test_files = self._find_test_files()
        main_source_dirs = self._find_main_source_dirs(project_type)
        
        structure = ProjectStructure(
            project_type=project_type,
            root_path=self.repo_path,
            primary_language=language,
            build_system=build_system,
            has_tests=len(test_files) > 0,
            has_docs=self._has_docs(),
            config_files=config_files,
            dependency_files=dependency_files,
            build_scripts=build_scripts,
            test_files=test_files,
            main_source_dirs=main_source_dirs,
        )
        
        logger.info(f"Project structure: {json.dumps(structure.to_dict(), indent=2)}")
        return structure
    
    def discover_relevant_files(self, task: str, structure: ProjectStructure) -> RelevantFiles:
        """
        Discover files relevant to the given task.
        
        Args:
            task: Task description (e.g., "Fix production build failure")
            structure: Project structure analysis
        
        Returns:
            RelevantFiles with categorized relevant files
        """
        logger.info(f"Discovering files relevant to task: {task}")
        task_lower = task.lower()
        
        # Categorize task
        is_build_issue = any(kw in task_lower for kw in self.BUILD_KEYWORDS)
        is_test_issue = any(kw in task_lower for kw in self.TEST_KEYWORDS)
        is_config_issue = any(kw in task_lower for kw in self.CONFIG_KEYWORDS)
        is_dependency_issue = any(kw in task_lower for kw in self.DEPENDENCY_KEYWORDS)
        is_performance_issue = any(kw in task_lower for kw in self.PERFORMANCE_KEYWORDS)
        is_security_issue = any(kw in task_lower for kw in self.SECURITY_KEYWORDS)
        
        # Get git status for context
        git_status = self._get_git_status()
        
        # Discover likely affected files based on task type
        likely_affected = []
        
        if is_build_issue:
            likely_affected.extend(structure.build_scripts)
            likely_affected.extend(structure.config_files)
        
        if is_test_issue:
            likely_affected.extend(structure.test_files)
        
        if is_dependency_issue:
            likely_affected.extend(structure.dependency_files)
        
        if is_performance_issue or is_security_issue:
            likely_affected.extend(structure.main_source_dirs)
        
        # Add modified files as likely affected
        likely_affected.extend([f for f, status in git_status.items() if status == "modified"])
        
        # Find related files using grep
        related_files = self._find_related_files_by_keywords(task_lower)
        
        # Categorize files
        relevant = RelevantFiles(
            likely_affected=list(set(likely_affected)),  # Remove duplicates
            config_files=structure.config_files,
            test_files=structure.test_files,
            related_files=related_files,
            git_status=git_status,
        )
        
        logger.info(f"Discovered {len(relevant.likely_affected)} likely affected files")
        logger.debug(f"Relevant files: {json.dumps(relevant.to_dict(), indent=2)}")
        
        return relevant
    
    def get_repository_context(self) -> str:
        """
        Get human-readable repository context for patch planning.
        
        Returns:
            Formatted string describing repository state and structure
        """
        logger.debug("Generating repository context")
        
        # Get git info
        git_log = self._run_safe_command("git log --oneline -5")
        git_status = self._run_safe_command("git status --short")
        git_branch = self._run_safe_command("git rev-parse --abbrev-ref HEAD")
        
        # Get file tree preview
        tree_preview = self._run_safe_command("find . -type f -name '*.py' -o -name '*.js' -o -name '*.go' | head -20")
        
        context = f"""
Repository Context:
- Current branch: {git_branch.strip()}
- Recent commits:
{git_log}

Current changes:
{git_status}

Key files:
{tree_preview}
"""
        return context
    
    # Private helper methods
    
    def _detect_project_type(self) -> ProjectType:
        """Detect project type by checking for marker files"""
        files_in_root = set(f.name for f in self.repo_path.iterdir() if f.is_file())
        
        if any(m in files_in_root for m in self.PYTHON_MARKERS):
            return ProjectType.PYTHON
        if any(m in files_in_root for m in self.NODEJS_MARKERS):
            return ProjectType.NODEJS
        if any(m in files_in_root for m in self.RUST_MARKERS):
            return ProjectType.RUST
        if any(m in files_in_root for m in self.GO_MARKERS):
            return ProjectType.GO
        if any(m in files_in_root for m in self.JAVA_MARKERS):
            return ProjectType.JAVA
        if any(m in files_in_root for m in self.RUBY_MARKERS):
            return ProjectType.RUBY
        
        return ProjectType.UNKNOWN
    
    def _detect_language_and_build_system(self, project_type: ProjectType) -> tuple[str, str]:
        """Detect primary language and build system"""
        mapping = {
            ProjectType.PYTHON: ("Python", "poetry" if (self.repo_path / "pyproject.toml").exists() else "pip"),
            ProjectType.NODEJS: ("JavaScript/TypeScript", "npm" if (self.repo_path / "package-lock.json").exists() else "yarn"),
            ProjectType.RUST: ("Rust", "cargo"),
            ProjectType.GO: ("Go", "go"),
            ProjectType.JAVA: ("Java", "gradle" if (self.repo_path / "build.gradle").exists() else "maven"),
            ProjectType.RUBY: ("Ruby", "bundler"),
        }
        return mapping.get(project_type, ("Unknown", "unknown"))
    
    def _find_config_files(self) -> List[str]:
        """Find configuration files"""
        config_patterns = [
            "*.config.js", "*.config.ts",
            "tsconfig.json", "vite.config.ts", "webpack.config.js",
            ".eslintrc*", ".prettierrc*",
            "setup.cfg", "setup.py",
            "Makefile", "CMakeLists.txt",
            ".github/workflows/*", ".gitlab-ci.yml", ".circleci/config.yml",
        ]
        
        found = []
        for pattern in config_patterns:
            result = self._run_safe_command(f"find . -name '{pattern}' -type f 2>/dev/null | head -5")
            if result.strip():
                found.extend(result.strip().split('\n'))
        
        return list(set(found))[:10]  # Limit to 10
    
    def _find_dependency_files(self, project_type: ProjectType) -> List[str]:
        """Find dependency/package files"""
        files = {
            ProjectType.PYTHON: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"],
            ProjectType.NODEJS: ["package.json", "package-lock.json", "yarn.lock"],
            ProjectType.RUST: ["Cargo.toml", "Cargo.lock"],
            ProjectType.GO: ["go.mod", "go.sum"],
            ProjectType.JAVA: ["pom.xml", "build.gradle"],
            ProjectType.RUBY: ["Gemfile", "Gemfile.lock"],
        }
        
        candidates = files.get(project_type, [])
        found = []
        for f in candidates:
            if (self.repo_path / f).exists():
                found.append(f)
        return found
    
    def _find_build_scripts(self, project_type: ProjectType) -> List[str]:
        """Find build/test scripts"""
        scripts = []
        
        # Check package.json for npm scripts
        if (self.repo_path / "package.json").exists():
            try:
                with open(self.repo_path / "package.json") as f:
                    data = json.load(f)
                    if "scripts" in data:
                        scripts.extend(data["scripts"].keys())
            except Exception as e:
                logger.debug(f"Error reading package.json: {e}")
        
        # Check for Makefile targets
        if (self.repo_path / "Makefile").exists():
            result = self._run_safe_command("grep -E '^[a-zA-Z_-]+:' Makefile | cut -d: -f1")
            if result.strip():
                scripts.extend(result.strip().split('\n'))
        
        return scripts[:10]  # Limit to 10
    
    def _find_test_files(self) -> List[str]:
        """Find test files"""
        result = self._run_safe_command(
            "find . -type f \\( -name '*test*.py' -o -name '*test*.js' -o -name '*_test.go' \\) | head -10"
        )
        return result.strip().split('\n') if result.strip() else []
    
    def _find_main_source_dirs(self, project_type: ProjectType) -> List[str]:
        """Find main source directories"""
        dirs = {
            ProjectType.PYTHON: ["app", "src", "lib", "src/main"],
            ProjectType.NODEJS: ["src", "lib", "dist"],
            ProjectType.RUST: ["src"],
            ProjectType.GO: ["cmd", "pkg"],
        }
        
        candidates = dirs.get(project_type, [])
        found = []
        for d in candidates:
            if (self.repo_path / d).exists():
                found.append(d)
        return found
    
    def _has_docs(self) -> bool:
        """Check if project has documentation"""
        doc_indicators = ["docs", "README.md", "CONTRIBUTING.md"]
        return any((self.repo_path / d).exists() for d in doc_indicators)
    
    def _get_git_status(self) -> Dict[str, str]:
        """Get git status of modified files"""
        result = self._run_safe_command("git status --porcelain")
        
        status_dict = {}
        for line in result.strip().split('\n'):
            if not line or len(line) < 3:
                continue
            status_code = line[:2].strip()
            filename = line[3:].strip()  # Skip the space at position 2
            
            if not filename:
                continue
            
            status_map = {
                'M': 'modified',
                'A': 'added',
                'D': 'deleted',
                '??': 'untracked',
            }
            status_dict[filename] = status_map.get(status_code, 'unknown')
        
        return status_dict
    
    def _find_related_files_by_keywords(self, task_lower: str) -> List[str]:
        """Find related files using keyword search"""
        # Extract key nouns from task
        keywords = []
        for word in task_lower.split():
            if len(word) > 3 and word not in {"that", "this", "with", "from", "into", "build", "fail", "error"}:
                keywords.append(word)
        
        found = []
        for keyword in keywords[:3]:  # Limit to 3 keywords
            result = self._run_safe_command(
                f"grep -r '{keyword}' --include='*.py' --include='*.js' --include='*.go' . 2>/dev/null | cut -d: -f1 | sort -u | head -5"
            )
            if result.strip():
                found.extend(result.strip().split('\n'))
        
        return list(set(found))[:10]  # Remove duplicates, limit to 10
    
    def _run_safe_command(self, command: str) -> str:
        """Run command safely using terminal executor"""
        try:
            full_cmd = f"cd {self.repo_path} && {command}"
            result = self.terminal_executor.run(full_cmd)
            return result.get("output", "") if result.get("success") else ""
        except Exception as e:
            logger.debug(f"Error running command '{command}': {e}")
            return ""
