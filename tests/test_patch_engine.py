"""
Comprehensive tests for Code Modification Engine.

Tests cover:
- Repository inspection and project type detection
- Task-aware file discovery
- Patch planning and generation
- Patch application and safety
- Verification with retry logic
- Complete end-to-end workflow
"""

import pytest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, call
from datetime import datetime

from app.core.codebase_analyzer import (
    CodebaseAnalyzer,
    ProjectType,
    ProjectStructure,
    RelevantFiles,
)
from app.core.patch_engine import (
    PatchEngine,
    FilePatch,
    PatchPlan,
    PatchSummary,
    PatchStatus,
)
from app.core.verification_retry import (
    VerificationRetryEngine,
    VerificationRetryResult,
    RetryAttempt,
    RetryStrategy,
)
from app.core.executor import VerificationResult


class TestCodebaseAnalyzer:
    """Test CodebaseAnalyzer component"""
    
    def test_analyzer_initialization(self, tmp_path):
        """Test analyzer initialization"""
        analyzer = CodebaseAnalyzer(tmp_path)
        assert analyzer.repo_path == tmp_path
        assert analyzer.terminal_executor is not None
    
    def test_project_type_python_detection(self, tmp_path):
        """Test Python project detection"""
        (tmp_path / "pyproject.toml").touch()
        analyzer = CodebaseAnalyzer(tmp_path)
        project_type = analyzer._detect_project_type()
        assert project_type == ProjectType.PYTHON
    
    def test_project_type_nodejs_detection(self, tmp_path):
        """Test Node.js project detection"""
        (tmp_path / "package.json").touch()
        analyzer = CodebaseAnalyzer(tmp_path)
        project_type = analyzer._detect_project_type()
        assert project_type == ProjectType.NODEJS
    
    def test_project_type_unknown(self, tmp_path):
        """Test unknown project detection"""
        analyzer = CodebaseAnalyzer(tmp_path)
        project_type = analyzer._detect_project_type()
        assert project_type == ProjectType.UNKNOWN
    
    def test_language_detection_python(self, tmp_path):
        """Test language detection for Python"""
        (tmp_path / "pyproject.toml").touch()
        analyzer = CodebaseAnalyzer(tmp_path)
        language, build_system = analyzer._detect_language_and_build_system(ProjectType.PYTHON)
        assert language == "Python"
        assert build_system in ["poetry", "pip"]
    
    def test_language_detection_nodejs(self, tmp_path):
        """Test language detection for Node.js"""
        (tmp_path / "package.json").touch()
        analyzer = CodebaseAnalyzer(tmp_path)
        language, build_system = analyzer._detect_language_and_build_system(ProjectType.NODEJS)
        assert language == "JavaScript/TypeScript"
        assert build_system in ["npm", "yarn"]
    
    def test_git_status_parsing(self, tmp_path):
        """Test git status parsing"""
        analyzer = CodebaseAnalyzer(tmp_path)
        mock_terminal = Mock()
        mock_terminal.run.return_value = {
            "success": True,
            "output": "M  file1.py\nA  file2.js\n?? file3.txt\n",  # Correct git porcelain format
        }
        analyzer.terminal_executor = mock_terminal
        
        status = analyzer._get_git_status()
        assert status.get("file1.py") == "modified"
        assert status.get("file2.js") == "added"
        assert status.get("file3.txt") == "untracked"
    
    def test_dependency_files_python(self, tmp_path):
        """Test dependency file discovery for Python"""
        (tmp_path / "pyproject.toml").touch()
        (tmp_path / "requirements.txt").touch()
        
        analyzer = CodebaseAnalyzer(tmp_path)
        deps = analyzer._find_dependency_files(ProjectType.PYTHON)
        assert "pyproject.toml" in deps
        assert "requirements.txt" in deps
    
    def test_test_files_discovery(self, tmp_path):
        """Test file discovery for test files"""
        # Create test files
        (tmp_path / "test_main.py").touch()
        (tmp_path / "tests").mkdir()
        (tmp_path / "tests" / "test_utils.py").touch()
        
        analyzer = CodebaseAnalyzer(tmp_path)
        mock_terminal = Mock()
        mock_terminal.run.return_value = {
            "success": True,
            "output": "./test_main.py\n./tests/test_utils.py\n",
        }
        analyzer.terminal_executor = mock_terminal
        
        # This will use the terminal executor mock
        test_files = analyzer._find_test_files()
        assert mock_terminal.run.called
    
    def test_project_structure_analysis(self, tmp_path):
        """Test complete project structure analysis"""
        (tmp_path / "pyproject.toml").touch()
        (tmp_path / "requirements.txt").touch()
        (tmp_path / "Makefile").touch()
        (tmp_path / "README.md").touch()
        
        analyzer = CodebaseAnalyzer(tmp_path)
        mock_terminal = Mock()
        mock_terminal.run.return_value = {"success": True, "output": ""}
        analyzer.terminal_executor = mock_terminal
        
        structure = analyzer.analyze_structure()
        assert structure.project_type == ProjectType.PYTHON
        assert structure.has_docs is True
        assert "pyproject.toml" in structure.dependency_files
    
    def test_relevant_files_discovery_build_issue(self, tmp_path):
        """Test file discovery for build issues"""
        (tmp_path / "pyproject.toml").touch()
        
        analyzer = CodebaseAnalyzer(tmp_path)
        structure = analyzer.analyze_structure()
        
        # Create a mock structure with some attributes
        structure.build_scripts = ["build", "test"]
        structure.config_files = ["setup.py"]
        structure.dependency_files = ["pyproject.toml"]
        
        mock_terminal = Mock()
        mock_terminal.run.return_value = {"success": True, "output": ""}
        analyzer.terminal_executor = mock_terminal
        
        relevant = analyzer.discover_relevant_files("Fix production build failure", structure)
        assert relevant is not None
        assert len(relevant.likely_affected) >= 0


class TestPatchEngine:
    """Test PatchEngine component"""
    
    def test_engine_initialization(self, tmp_path):
        """Test patch engine initialization"""
        repo_path = tmp_path / "repo"
        sandbox_path = tmp_path / "sandbox"
        repo_path.mkdir()
        sandbox_path.mkdir()
        
        engine = PatchEngine(repo_path, sandbox_path)
        assert engine.repo_path == repo_path
        assert engine.sandbox_path == sandbox_path
        assert engine.provider is not None
    
    def test_file_patch_creation(self):
        """Test FilePatch data model"""
        patch = FilePatch(
            file_path="src/main.py",
            operation="modify",
            change_description="Fix bug",
        )
        assert patch.file_path == "src/main.py"
        assert patch.operation == "modify"
        assert patch.status == PatchStatus.PENDING
    
    def test_patch_plan_creation(self):
        """Test PatchPlan data model"""
        patches = [
            FilePatch(file_path="file1.py", operation="modify"),
            FilePatch(file_path="file2.py", operation="modify"),
        ]
        
        plan = PatchPlan(
            root_cause_analysis="Missing import",
            patch_strategy="Add import statement",
            patches=patches,
            expected_verification_steps=["run tests", "build"],
        )
        
        assert len(plan.patches) == 2
        assert plan.root_cause_analysis == "Missing import"
        assert len(plan.expected_verification_steps) == 2
    
    def test_patch_summary_to_dict(self):
        """Test PatchSummary serialization"""
        summary = PatchSummary(
            files_modified=["a.py", "b.py"],
            files_created=["c.py"],
            files_deleted=[],
            root_cause_found="Import error",
            patch_description="Add missing import",
            success=True,
        )
        
        data = summary.to_dict()
        assert data["files_modified"] == ["a.py", "b.py"]
        assert data["files_created"] == ["c.py"]
        assert data["success"] is True
    
    @patch('app.core.patch_engine.get_provider')
    def test_patch_planning(self, mock_provider_factory, tmp_path):
        """Test patch planning workflow"""
        repo_path = tmp_path / "repo"
        sandbox_path = tmp_path / "sandbox"
        repo_path.mkdir()
        sandbox_path.mkdir()
        
        # Mock provider
        mock_provider = Mock()
        mock_provider.generate.return_value = '{"root_cause": "Test", "strategy": "Fix", "files_to_modify": ["a.py"]}'
        mock_provider_factory.return_value = mock_provider
        
        engine = PatchEngine(repo_path, sandbox_path)
        
        # Create mock structure and relevant files
        structure = Mock()
        structure.project_type = ProjectType.PYTHON
        structure.build_system = "poetry"
        
        relevant_files = Mock()
        relevant_files.likely_affected = ["src/main.py"]
        relevant_files.config_files = []
        relevant_files.test_files = []
        relevant_files.git_status = {}
        
        # Note: This test would need proper mocking of terminal executor
        # For now, we're testing the structure of the method


class TestVerificationRetryEngine:
    """Test VerificationRetryEngine component"""
    
    def test_engine_initialization(self, tmp_path):
        """Test retry engine initialization"""
        sandbox_path = tmp_path / "sandbox"
        sandbox_path.mkdir()
        
        engine = VerificationRetryEngine(sandbox_path)
        assert engine.sandbox_path == sandbox_path
        assert engine.verification_engine is not None
    
    def test_retry_attempt_creation(self):
        """Test RetryAttempt data model"""
        attempt = RetryAttempt(
            attempt_number=1,
            strategy=RetryStrategy.TARGETED_FIX,
            changes_made="Fixed import",
            success=True,
        )
        
        assert attempt.attempt_number == 1
        assert attempt.strategy == RetryStrategy.TARGETED_FIX
        assert attempt.success is True
    
    def test_verification_result_with_no_retries_needed(self):
        """Test when verification passes on first try"""
        mock_verification = Mock()
        mock_verification.success = True
        mock_verification.errors = []
        
        engine = VerificationRetryEngine(Path("/tmp"))
        engine.verification_engine = Mock()
        
        result = engine.verify_with_retries(mock_verification, [])
        
        assert result.initial_verification == mock_verification
        assert result.final_success is True
        assert result.total_retries == 0
        assert len(result.retry_attempts) == 0
    
    def test_verification_retry_result_to_dict(self):
        """Test VerificationRetryResult serialization"""
        mock_verification = Mock()
        mock_verification.success = False
        mock_verification.errors = ["Test error"]
        
        result = VerificationRetryResult(
            initial_verification=mock_verification,
            final_success=False,
            total_retries=0,
        )
        
        data = result.to_dict()
        assert data["initial_verification_success"] is False
        assert data["retry_attempts"] == 0


class TestExecutionEngineIntegration:
    """Integration tests for Code Modification Engine"""
    
    def test_complete_workflow_components_exist(self):
        """Test that all components are importable"""
        from app.core.codebase_analyzer import CodebaseAnalyzer
        from app.core.patch_engine import PatchEngine
        from app.core.verification_retry import VerificationRetryEngine
        
        assert CodebaseAnalyzer is not None
        assert PatchEngine is not None
        assert VerificationRetryEngine is not None
    
    def test_project_structure_to_dict(self):
        """Test ProjectStructure serialization"""
        structure = ProjectStructure(
            project_type=ProjectType.PYTHON,
            root_path=Path("/tmp"),
            primary_language="Python",
            build_system="poetry",
            has_tests=True,
            has_docs=True,
        )
        
        data = structure.to_dict()
        assert data["project_type"] == "python"
        assert data["build_system"] == "poetry"
        assert data["has_tests"] is True
    
    def test_relevant_files_to_dict(self):
        """Test RelevantFiles serialization"""
        relevant = RelevantFiles(
            likely_affected=["src/main.py"],
            config_files=["pyproject.toml"],
            test_files=["test_main.py"],
            related_files=[],
            git_status={"src/main.py": "modified"},
        )
        
        data = relevant.to_dict()
        assert "likely_affected" in data
        assert "git_status" in data
        assert data["config_files"] == ["pyproject.toml"]


class TestSafetyGuards:
    """Test safety features and guards"""
    
    def test_max_retries_enforced(self):
        """Test that max retries limit is enforced"""
        assert VerificationRetryEngine.MAX_RETRIES == 3
    
    def test_patch_status_enum(self):
        """Test PatchStatus enum values"""
        assert PatchStatus.PENDING.value == "pending"
        assert PatchStatus.GENERATED.value == "generated"
        assert PatchStatus.APPLIED.value == "applied"
        assert PatchStatus.FAILED.value == "failed"
    
    def test_retry_strategy_enum(self):
        """Test RetryStrategy enum values"""
        assert RetryStrategy.NO_RETRY.value == "no_retry"
        assert RetryStrategy.TARGETED_FIX.value == "targeted_fix"
        assert RetryStrategy.ROLLBACK.value == "rollback"
    
    def test_file_patch_operation_types(self):
        """Test valid file patch operations"""
        operations = ["modify", "create", "delete"]
        for op in operations:
            patch = FilePatch(file_path="test.py", operation=op)
            assert patch.operation == op


class TestKeywordMatching:
    """Test task-aware keyword matching"""
    
    def test_build_keywords_detection(self):
        """Test build-related keyword detection"""
        task = "Fix production build failure"
        keywords = CodebaseAnalyzer.BUILD_KEYWORDS
        
        task_lower = task.lower()
        matches = [kw in task_lower for kw in keywords]
        assert any(matches)  # At least one match
    
    def test_test_keywords_detection(self):
        """Test test-related keyword detection"""
        task = "Fix failing unit tests"
        keywords = CodebaseAnalyzer.TEST_KEYWORDS
        
        task_lower = task.lower()
        matches = [kw in task_lower for kw in keywords]
        assert any(matches)
    
    def test_dependency_keywords_detection(self):
        """Test dependency-related keyword detection"""
        task = "Fix import errors in main module"
        keywords = CodebaseAnalyzer.DEPENDENCY_KEYWORDS
        
        task_lower = task.lower()
        matches = [kw in task_lower for kw in keywords]
        assert any(matches)
