import os
from pathlib import Path

TEST_ROOT = Path("/tmp/caiji3-backend-tests")
TEST_ROOT.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = TEST_ROOT / "collector-test.db"
for path in TEST_ROOT.glob("collector-test.db*"):
    path.unlink(missing_ok=True)

os.environ["COLLECTOR_DATABASE_URL"] = f"sqlite:///{DATABASE_PATH}"
os.environ["COLLECTOR_RUN_ROOT"] = str(TEST_ROOT / "runs")
os.environ["COLLECTOR_ALLOWED_HOSTS"] = "ggzyfw.beijing.gov.cn"
