"""
Tests for Elite CLI Core Components

Test Coverage:
- Data models (6 tests)
- Dev folder management (5 tests)
- Task classification (8 tests)
"""

import pytest
import tempfile
from pathlib import Path
from datetime import datetime

from app.cli.elite_models import (
    TaskSize, TaskType, ApprovalLevel,
    NaturalTaskRequest, ImplementationPlan,
    ApprovalRequest, ExecutionContext, CLIState
)
from app.cli.dev_manager import DevFolderManager
from app.cli.task_classifier import TaskClassifier


class TestDataModels:
    """Test elite CLI data models"""
    
    def test_task_size_enum(self):
        """Test TaskSize enum"""
        assert TaskSize.SMALL.value == "small"
        assert TaskSize.LARGE.value == "large"
    
    def test_natural_task_request_creation(self):
        """Test NaturalTaskRequest"""
        request = NaturalTaskRequest(
            raw_text="Fix build error",
            task_type=TaskType.BUG_FIX,
            task_size=TaskSize.SMALL,
            confidence=0.85
        )
        
        assert request.raw_text == "Fix build error"
        assert request.task_type == TaskType.BUG_FIX
        assert request.confidence == 0.85
    
    def test_natural_task_to_dict(self):
        """Test NaturalTaskRequest serialization"""
        request = NaturalTaskRequest(
            raw_text="test",
            task_type=TaskType.BUG_FIX,
            task_size=TaskSize.SMALL
        )
        
        data = request.to_dict()
        assert data['task_type'] == 'bug_fix'
        assert data['task_size'] == 'small'
    
    def test_implementation_plan_markdown(self):
        """Test ImplementationPlan markdown generation"""
        plan = ImplementationPlan(
            task_description="Fix JWT issue",
            task_type=TaskType.BUG_FIX,
            hypothesis="Token expiry not handled",
            affected_files=["app/auth.py"],
            proposed_changes=["Add refresh logic"],
            risks=["May break existing tokens"],
            verification_steps=["Test token expiry", "Verify refresh"],
            estimated_time_minutes=30
        )
        
        md = plan.to_markdown()
        assert "# Implementation Plan" in md
        assert "Fix JWT issue" in md
        assert "app/auth.py" in md
    
    def test_approval_request_summary(self):
        """Test ApprovalRequest summary"""
        request = ApprovalRequest(
            title="Ready to apply changes?",
            description="Will update auth system",
            risk_level=ApprovalLevel.MEDIUM,
            changed_files=["app/auth.py", "tests/auth_test.py"]
        )
        
        summary = request.summary()
        assert "Ready to apply changes?" in summary
        assert "MEDIUM" in summary
        assert "auth.py" in summary
    
    def test_cli_state_creation(self):
        """Test CLIState"""
        state = CLIState(
            model_name="DeepSeek V4",
            provider="DeepSeek",
            branch="main"
        )
        
        assert state.active is True
        assert state.model_name == "DeepSeek V4"


class TestDevFolderManager:
    """Test .dev folder management"""
    
    def test_ensure_dev_structure(self):
        """Test creating .dev structure"""
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            manager = DevFolderManager(project_root)
            
            assert manager.ensure_dev_structure()
            assert (project_root / ".dev").exists()
            assert (project_root / ".dev" / "plans").exists()
            assert (project_root / ".dev" / "diffs").exists()
    
    def test_get_subdirectories(self):
        """Test getting subdirectory paths"""
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            manager = DevFolderManager(project_root)
            manager.ensure_dev_structure()
            
            assert manager.get_plans_dir().exists()
            assert manager.get_diffs_dir().exists()
            assert manager.get_logs_dir().exists()
    
    def test_list_plans(self):
        """Test listing plans"""
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            manager = DevFolderManager(project_root)
            manager.ensure_dev_structure()
            
            # Create a test plan
            plans_dir = manager.get_plans_dir()
            (plans_dir / "test_plan.md").write_text("# Test Plan")
            
            plans = manager.list_plans()
            assert "test_plan.md" in plans
    
    def test_get_latest_plan(self):
        """Test getting latest plan"""
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            manager = DevFolderManager(project_root)
            manager.ensure_dev_structure()
            
            plans_dir = manager.get_plans_dir()
            (plans_dir / "plan1.md").write_text("Plan 1")
            (plans_dir / "plan2.md").write_text("Plan 2")
            
            latest = manager.get_latest_plan()
            assert latest is not None
            assert "plan" in latest.name
    
    def test_structure_summary(self):
        """Test structure summary"""
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            manager = DevFolderManager(project_root)
            manager.ensure_dev_structure()
            
            summary = manager.get_structure_summary()
            assert ".dev/" in summary
            assert "plans" in summary


class TestTaskClassifier:
    """Test task classification"""
    
    def test_classify_bug_fix_small(self):
        """Test classifying bug fix"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Fix the login bug")
        
        assert request.task_type == TaskType.BUG_FIX
        assert request.task_size == TaskSize.SMALL
        assert request.confidence > 0
    
    def test_classify_feature_large(self):
        """Test classifying large feature"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Build JWT authentication system")
        
        assert request.task_type == TaskType.FEATURE
        assert request.task_size == TaskSize.LARGE
    
    def test_classify_investigation_small(self):
        """Test classifying investigation"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Explain why the database is slow")
        
        assert request.task_type == TaskType.INVESTIGATION
    
    def test_classify_refactor_medium(self):
        """Test classifying refactor"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Refactor the authentication service")
        
        assert request.task_type == TaskType.REFACTOR
    
    def test_classify_unknown_type(self):
        """Test classifying unknown type"""
        classifier = TaskClassifier()
        
        request = classifier.classify("xyz abc qwerty")
        
        assert request.task_type == TaskType.UNKNOWN or request.confidence < 0.3
    
    def test_confidence_score_range(self):
        """Test confidence score is 0.0-1.0"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Fix important bug")
        
        assert 0.0 <= request.confidence <= 1.0
    
    def test_keywords_extraction(self):
        """Test keyword extraction"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Fix the production database connection issue")
        
        assert len(request.keywords) > 0
        assert "production" in request.keywords or "database" in request.keywords
    
    def test_size_heuristics_feature(self):
        """Test that features are classified as large"""
        classifier = TaskClassifier()
        
        request = classifier.classify("Build new payment system")
        
        # Features should be large
        assert request.task_size in [TaskSize.LARGE, TaskSize.MEDIUM]


class TestImplementationPlan:
    """Test plan generation"""
    
    def test_plan_save_to_file(self):
        """Test saving plan to file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            dev_dir = Path(tmpdir) / ".dev"
            dev_dir.mkdir()
            
            plan = ImplementationPlan(
                task_description="Fix JWT issue",
                task_type=TaskType.BUG_FIX,
                hypothesis="Token not refreshing",
                affected_files=["auth.py"],
                proposed_changes=["Add refresh handler"],
                risks=["May break existing sessions"],
                verification_steps=["Test token expiry"],
                estimated_time_minutes=30
            )
            
            assert plan.save_to_file(dev_dir)
            assert plan.filename is not None
            
            # Verify file exists
            plans_dir = dev_dir / "plans"
            plan_file = plans_dir / plan.filename
            assert plan_file.exists()


class TestExecutionContext:
    """Test execution context"""
    
    def test_is_small_task(self):
        """Test checking small task"""
        request = NaturalTaskRequest(
            raw_text="test",
            task_size=TaskSize.SMALL
        )
        
        with tempfile.TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            dev_dir = project_root / ".dev"
            dev_dir.mkdir()
            
            context = ExecutionContext(
                task_request=request,
                project_root=project_root,
                dev_dir=dev_dir
            )
            
            assert context.is_small_task()
            assert not context.is_large_task()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
