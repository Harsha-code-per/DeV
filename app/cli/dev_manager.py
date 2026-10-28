"""
.dev Folder Management

Creates and manages:
- .dev/plans/
- .dev/diffs/
- .dev/memory/
- .dev/logs/
- .dev/sessions/
- .dev/checkpoints/
- .dev/browser/
"""

from pathlib import Path
from typing import Optional
from app.utils.logger import get_logger

logger = get_logger(__name__)


class DevFolderManager:
    """Manages .dev project intelligence folder"""
    
    # Standard .dev structure
    SUBDIRS = [
        "plans",
        "diffs", 
        "memory",
        "logs",
        "sessions",
        "checkpoints",
        "browser",
        "artifacts",
    ]
    
    GITIGNORE_CONTENT = """# DeV Project Intelligence Folder
# Contains: plans, diffs, memory, logs, sessions, checkpoints, browser artifacts

# Ignore all contents
*

# But track structure
!.gitkeep
!.gitignore
"""
    
    def __init__(self, project_root: Path):
        """Initialize manager for project"""
        self.project_root = project_root
        self.dev_dir = project_root / ".dev"
    
    def ensure_dev_structure(self) -> bool:
        """
        Create .dev folder structure if missing
        
        Returns:
            True if successful or already exists
        """
        try:
            # Create main .dev folder
            self.dev_dir.mkdir(parents=True, exist_ok=True)
            
            # Create subdirectories
            for subdir in self.SUBDIRS:
                subdir_path = self.dev_dir / subdir
                subdir_path.mkdir(parents=True, exist_ok=True)
                
                # Create .gitkeep for git tracking
                gitkeep = subdir_path / ".gitkeep"
                gitkeep.touch()
            
            # Create .gitignore
            self._create_gitignore()
            
            logger.info(f"Ensured .dev structure at {self.dev_dir}")
            return True
        
        except Exception as e:
            logger.error(f"Error creating .dev structure: {e}")
            return False
    
    def _create_gitignore(self) -> bool:
        """Create .gitignore for .dev folder"""
        try:
            gitignore_path = self.dev_dir / ".gitignore"
            
            # Only write if doesn't exist or is empty
            if not gitignore_path.exists() or gitignore_path.stat().st_size == 0:
                gitignore_path.write_text(self.GITIGNORE_CONTENT)
            
            return True
        except Exception as e:
            logger.warning(f"Error creating .gitignore: {e}")
            return False
    
    def get_plans_dir(self) -> Path:
        """Get plans directory"""
        return self.dev_dir / "plans"
    
    def get_diffs_dir(self) -> Path:
        """Get diffs directory"""
        return self.dev_dir / "diffs"
    
    def get_logs_dir(self) -> Path:
        """Get logs directory"""
        return self.dev_dir / "logs"
    
    def get_sessions_dir(self) -> Path:
        """Get sessions directory"""
        return self.dev_dir / "sessions"
    
    def list_plans(self) -> list:
        """List all markdown plans in .dev/plans/"""
        try:
            plans_dir = self.get_plans_dir()
            if not plans_dir.exists():
                return []
            
            return [f.name for f in plans_dir.glob("*.md")]
        except Exception as e:
            logger.warning(f"Error listing plans: {e}")
            return []
    
    def get_latest_plan(self) -> Optional[Path]:
        """Get most recent plan file"""
        try:
            plans = list(self.get_plans_dir().glob("*.md"))
            if not plans:
                return None
            return max(plans, key=lambda p: p.stat().st_mtime)
        except Exception as e:
            logger.warning(f"Error getting latest plan: {e}")
            return None
    
    def clean_old_sessions(self, keep_count: int = 10) -> bool:
        """Clean old session files, keep most recent N"""
        try:
            sessions_dir = self.get_sessions_dir()
            if not sessions_dir.exists():
                return True
            
            sessions = sorted(
                sessions_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            
            # Remove older sessions
            for session_file in sessions[keep_count:]:
                session_file.unlink()
                logger.debug(f"Cleaned session: {session_file.name}")
            
            return True
        except Exception as e:
            logger.warning(f"Error cleaning sessions: {e}")
            return False
    
    def get_structure_summary(self) -> str:
        """Get text summary of .dev folder structure"""
        try:
            if not self.dev_dir.exists():
                return ".dev folder not initialized"
            
            summary = [".dev/"]
            
            for subdir in self.SUBDIRS:
                subdir_path = self.dev_dir / subdir
                if subdir_path.exists():
                    files = list(subdir_path.glob("*"))
                    # Don't count .gitkeep
                    files = [f for f in files if f.name != ".gitkeep"]
                    count = len(files)
                    summary.append(f"  ├─ {subdir}/ ({count} items)")
            
            return "\n".join(summary)
        except Exception as e:
            logger.warning(f"Error getting structure: {e}")
            return ".dev folder error"
